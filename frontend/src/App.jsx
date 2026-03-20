import { useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import api from "./lib/api";
import "./App.css";

const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const sessionOptions = ["30 minutes", "1 hour", "2 hours", "3 hours"];

const breakOptions = [
  "5-minute break after 30 minutes of study",
  "10-minute break after 1 hour of study",
  "15-minute break after 2 hours of study",
];

const prepModes = [
  { value: "full-prep", label: "Full Preparation" },
  { value: "last-month", label: "Last Month Prep" },
  { value: "crash-prep", label: "Crash Prep / Last Week" },
];

function App() {
  const resultRef = useRef(null);

  const [initialLoading, setInitialLoading] = useState(true);

  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [billing, setBilling] = useState(null);

  const [inputMode, setInputMode] = useState("upload");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFile, setSourceFile] = useState(null);

  const [studyTime, setStudyTime] = useState(2);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [studyDays, setStudyDays] = useState([]);

  const [maxSessionLength, setMaxSessionLength] = useState("1 hour");
  const [breakInterval, setBreakInterval] = useState(
    "5-minute break after 30 minutes of study",
  );

  const [examName, setExamName] = useState("");
  const [boardUniversity, setBoardUniversity] = useState("");
  const [classSemester, setClassSemester] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [prepMode, setPrepMode] = useState("last-month");
  const [enableWebResearch, setEnableWebResearch] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const isLimited = Boolean(billing?.is_limited);

  const remainingPercentage = useMemo(() => {
    if (!billing?.limit_usd) return 100;

    return Math.max(
      0,
      Math.min(100, (billing.remaining_usd / billing.limit_usd) * 100),
    );
  }, [billing]);

  const formatMoney = (value) => {
    const number = Number(value || 0);
    return `$${number.toFixed(2)}`;
  };

  const formatResetAt = (value) => {
    if (!value) return "next month";
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  };

  const loadMe = async () => {
    try {
      const response = await api.get("/api/auth/me");
      setUser(response.data.user);
      setBilling(response.data.billing);
    } catch {
      localStorage.removeItem("padhlyebhaiai_token");
      setUser(null);
      setBilling(null);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("padhlyebhaiai_token");

    if (token) {
      loadMe();
    } else {
      setInitialLoading(false);
    }
  }, []);

  const handleAuth = async (event) => {
    event.preventDefault();
    setError("");

    if (!authEmail.trim() || !authPassword.trim()) {
      setError("Please enter email and password.");
      return;
    }

    try {
      setAuthLoading(true);

      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";

      const response = await api.post(endpoint, {
        email: authEmail.trim(),
        password: authPassword,
      });

      localStorage.setItem("padhlyebhaiai_token", response.data.access_token);

      setUser(response.data.user);
      setBilling(response.data.billing);
      setAuthEmail("");
      setAuthPassword("");
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Authentication failed. Try again.",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("padhlyebhaiai_token");
    setUser(null);
    setBilling(null);
    setResult(null);
    setError("");
  };

  const toggleStudyDay = (day) => {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSourceFile(file);
  };

  const validateForm = () => {
    if (!startDate || !endDate) {
      return "Please select start and end dates.";
    }

    if (new Date(startDate) > new Date(endDate)) {
      return "Start date cannot be after end date.";
    }

    if (studyDays.length === 0) {
      return "Please select at least one study day.";
    }

    if (inputMode === "url" && !sourceUrl.trim()) {
      return "Please enter an image URL.";
    }

    if (inputMode === "upload" && !sourceFile) {
      return "Please upload a syllabus image or PDF.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setResult(null);

    if (isLimited) {
      setError(
        `Your free limit is utilized for this month. It will reset on ${formatResetAt(
          billing?.reset_at,
        )}.`,
      );
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("study_time", String(studyTime));
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("study_days", JSON.stringify(studyDays));
      formData.append("max_session_length", maxSessionLength);
      formData.append("break_interval", breakInterval);
      formData.append("exam_name", examName);
      formData.append("board_university", boardUniversity);
      formData.append("class_semester", classSemester);
      formData.append("subject_name", subjectName);
      formData.append("prep_mode", prepMode);
      formData.append("enable_web_research", String(enableWebResearch));

      if (inputMode === "url") {
        formData.append("source_url", sourceUrl.trim());
      } else if (sourceFile) {
        formData.append("source_file", sourceFile);
      }

      const response = await api.post("/api/study-plan", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setResult(response.data);

      if (response.data.billing) {
        setBilling(response.data.billing);
      } else {
        await loadMe();
      }
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        "Something went wrong while generating the plan.";

      setError(message);

      if (err?.response?.status === 401) {
        handleLogout();
      }

      if (err?.response?.status === 402) {
        await loadMe();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!resultRef.current) return;

    html2pdf()
      .set({
        margin: 0.4,
        filename: `padhlyebhaiai-study-plan-${
          new Date().toISOString().split("T")[0]
        }.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#060816",
        },
        jsPDF: {
          unit: "in",
          format: "a4",
          orientation: "portrait",
        },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(resultRef.current)
      .save();
  };

  const handleResetPlanner = () => {
    setInputMode("upload");
    setSourceUrl("");
    setSourceFile(null);

    setStudyTime(2);
    setStartDate("");
    setEndDate("");
    setStudyDays([]);

    setMaxSessionLength("1 hour");
    setBreakInterval("5-minute break after 30 minutes of study");

    setExamName("");
    setBoardUniversity("");
    setClassSemester("");
    setSubjectName("");
    setPrepMode("last-month");
    setEnableWebResearch(true);

    setResult(null);
    setError("");
  };

  const topicList = result?.syllabus_outline?.all_topics || [];
  const unitList = result?.syllabus_outline?.units || [];
  const sourceList = result?.research_sources || [];

  if (initialLoading) {
    return (
      <div className="page">
        <div className="hero">
          <div className="hero-content">
            <h1>PadhLyeBhaiAI</h1>
            <p>Loading your workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="hero">
          <div className="hero-content">
            <div className="hero-badges">
              <span className="badge">AI Study Planner</span>
              <span className="badge">Image + PDF Support</span>
              <span className="badge">Free Monthly Credit</span>
            </div>

            <h1>PadhLyeBhaiAI</h1>
            <p>
              Upload your syllabus, let AI research the exam, prioritize what
              matters most, and generate a practical study timetable.
            </p>
          </div>

          <div className="hero-glow" />
        </div>

        <div className="auth-shell">
          <div className="panel auth-card">
            <div className="section-header">
              <h2>Welcome</h2>
              <p>
                Sign in or create an account to use your free monthly study-plan
                credits.
              </p>
            </div>

            <div className="mode-switch">
              <button
                type="button"
                className={authMode === "login" ? "mode active" : "mode"}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>

              <button
                type="button"
                className={authMode === "register" ? "mode active" : "mode"}
                onClick={() => setAuthMode("register")}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuth} className="form">
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={authLoading}
              >
                {authLoading
                  ? authMode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : authMode === "login"
                    ? "Login"
                    : "Create Account"}
              </button>
            </form>

            {error && <div className="alert error">{error}</div>}

            <div className="info-card">
              <h3>Free Usage Policy</h3>
              <p>
                Every user gets up to{" "}
                <strong>$2 worth of monthly credit</strong>.
              </p>
              <p>
                After that, generation is disabled for now and the limit resets
                next month.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-content">
          <div className="hero-badges">
            <span className="badge">Authenticated</span>
            <span className="badge">Research-Aware Planning</span>
            <span className="badge">PDF Export</span>
          </div>

          <h1>PadhLyeBhaiAI</h1>
          <p>
            Build a realistic exam prep plan from your syllabus image or PDF,
            backed by AI analysis and exam-context research.
          </p>
        </div>

        <div className="hero-glow" />
      </div>

      <div className="account-bar panel">
        <div className="account-main">
          <div>
            <h3>{user.email}</h3>
            <p>Logged in and ready to academically lock in.</p>
          </div>

          <button type="button" className="download-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {billing && (
          <div className="billing-card">
            <div className="billing-grid">
              <div className="stat-box">
                <span>Monthly Limit</span>
                <strong>{formatMoney(billing.limit_usd)}</strong>
              </div>

              <div className="stat-box">
                <span>Used</span>
                <strong>{formatMoney(billing.spent_usd)}</strong>
              </div>

              <div className="stat-box">
                <span>Remaining</span>
                <strong>{formatMoney(billing.remaining_usd)}</strong>
              </div>

              <div className="stat-box">
                <span>Requests</span>
                <strong>{billing.request_count}</strong>
              </div>
            </div>

            <div className="progress-wrap">
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${remainingPercentage}%` }}
                />
              </div>
              <small>Resets on {formatResetAt(billing.reset_at)}</small>
            </div>

            {isLimited && (
              <div className="alert error">
                Limit utilized for this month. Payments are disabled right now.
                Your next month limit will be reset automatically.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="layout">
        <div className="panel">
          <form onSubmit={handleSubmit} className="form">
            <div className="section-header">
              <h2>Syllabus Source</h2>
              <p>Upload an image/PDF or paste an image URL.</p>
            </div>

            <div className="mode-switch">
              <button
                type="button"
                className={inputMode === "upload" ? "mode active" : "mode"}
                onClick={() => setInputMode("upload")}
              >
                Upload File
              </button>

              <button
                type="button"
                className={inputMode === "url" ? "mode active" : "mode"}
                onClick={() => setInputMode("url")}
              >
                Image URL
              </button>
            </div>

            {inputMode === "upload" ? (
              <div className="upload-box">
                <label htmlFor="sourceFile" className="upload-label">
                  <span>Choose syllabus image or PDF</span>
                  <small>Supported: PNG, JPG, JPEG, WEBP, PDF</small>
                </label>

                <input
                  id="sourceFile"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  onChange={handleFileChange}
                />

                {sourceFile && (
                  <div className="file-chip">{sourceFile.name}</div>
                )}
              </div>
            ) : (
              <div className="field">
                <label>Image URL</label>
                <input
                  type="text"
                  placeholder="Paste your syllabus image URL"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </div>
            )}

            <div className="section-header">
              <h2>Exam Context</h2>
              <p>Help the AI research the right exam and subject.</p>
            </div>

            <div className="grid">
              <div className="field">
                <label>Exam Name</label>
                <input
                  type="text"
                  placeholder="e.g. GATE, CBSE Boards, End Sem"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Board / University / Course</label>
                <input
                  type="text"
                  placeholder="e.g. AKTU, CBSE, VTU"
                  value={boardUniversity}
                  onChange={(e) => setBoardUniversity(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Class / Semester</label>
                <input
                  type="text"
                  placeholder="e.g. Class 12, Sem 4"
                  value={classSemester}
                  onChange={(e) => setClassSemester(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Subject Name</label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Preparation Mode</label>
                <select
                  value={prepMode}
                  onChange={(e) => setPrepMode(e.target.value)}
                >
                  {prepModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Enable Web Research</label>
                <select
                  value={enableWebResearch ? "true" : "false"}
                  onChange={(e) =>
                    setEnableWebResearch(e.target.value === "true")
                  }
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div className="section-header">
              <h2>Schedule Preferences</h2>
              <p>Set your study window and available days.</p>
            </div>

            <div className="grid">
              <div className="field">
                <label>Daily Study Time (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={studyTime}
                  onChange={(e) => setStudyTime(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Available Study Days</label>
              <div className="days-grid">
                {daysOfWeek.map((day) => {
                  const active = studyDays.includes(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      className={active ? "day-chip active" : "day-chip"}
                      onClick={() => toggleStudyDay(day)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="section-header">
              <h2>Session Settings</h2>
              <p>Make it realistic, not punishment-based productivity.</p>
            </div>

            <div className="grid">
              <div className="field">
                <label>Maximum Study Session Length</label>
                <select
                  value={maxSessionLength}
                  onChange={(e) => setMaxSessionLength(e.target.value)}
                >
                  {sessionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Break Interval</label>
                <select
                  value={breakInterval}
                  onChange={(e) => setBreakInterval(e.target.value)}
                >
                  {breakOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="action-row">
              <button
                type="submit"
                className="submit-btn"
                disabled={loading || isLimited}
              >
                {loading
                  ? "Generating your timetable..."
                  : "Generate Timetable"}
              </button>

              <button
                type="button"
                className="download-btn secondary"
                onClick={handleResetPlanner}
                disabled={loading}
              >
                Reset
              </button>
            </div>

            {error && <div className="alert error">{error}</div>}
          </form>
        </div>

        <div className="panel result-panel">
          <div className="section-header">
            <h2>Your AI Timetable</h2>
            <p>
              Exam insights, topic priorities, and a practical day-wise study
              plan.
            </p>
          </div>

          {!result && !loading && (
            <div className="placeholder">
              <h3>No timetable yet</h3>
              <p>
                Upload a syllabus, choose your preferences, and generate your
                study plan.
              </p>
            </div>
          )}

          {loading && (
            <div className="placeholder">
              <h3>Generating your study plan...</h3>
              <p>
                Reading syllabus, researching the exam, and turning chaos into a
                timetable.
              </p>
            </div>
          )}

          {result && (
            <>
              <div className="result-actions">
                <div className="mini-badges">
                  <span className="badge soft">
                    {result.source_type === "pdf"
                      ? "PDF Parsed"
                      : "Image Parsed"}
                  </span>
                  <span className="badge soft">
                    {enableWebResearch ? "Web Research Used" : "Syllabus Only"}
                  </span>
                  {result.preview_url && (
                    <span className="badge soft">Preview Available</span>
                  )}
                </div>

                <button
                  type="button"
                  className="download-btn"
                  onClick={handleDownloadPdf}
                >
                  Save as PDF
                </button>
              </div>

              <div ref={resultRef} className="result-card">
                <div className="result-card-header">
                  <h3>PadhLyeBhaiAI Study Plan</h3>
                  <p>
                    Personalized timetable generated from your syllabus and exam
                    context.
                  </p>
                </div>

                {result.preview_url && (
                  <img
                    src={result.preview_url}
                    alt="Syllabus preview"
                    className="preview-image"
                  />
                )}

                {result.billing && (
                  <div className="info-card">
                    <h3>Updated Credit Usage</h3>
                    <p>
                      Used:{" "}
                      <strong>{formatMoney(result.billing.spent_usd)}</strong> /{" "}
                      {formatMoney(result.billing.limit_usd)}
                    </p>
                    <p>
                      Remaining:{" "}
                      <strong>
                        {formatMoney(result.billing.remaining_usd)}
                      </strong>
                    </p>
                  </div>
                )}

                {topicList.length > 0 && (
                  <div className="topics-card">
                    <h3>Extracted Topics</h3>
                    <div className="topics-list">
                      {topicList.slice(0, 24).map((topic, index) => (
                        <span key={`${topic}-${index}`} className="topic-pill">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {unitList.length > 0 && (
                  <div className="units-card">
                    <h3>Detected Units</h3>
                    <div className="units-list">
                      {unitList.slice(0, 10).map((unit, index) => (
                        <div
                          key={`${unit.name}-${index}`}
                          className="unit-item"
                        >
                          <strong>{unit.name || `Unit ${index + 1}`}</strong>

                          {Array.isArray(unit.topics) &&
                            unit.topics.length > 0 && (
                              <p>{unit.topics.slice(0, 6).join(", ")}</p>
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.schedule_markdown}
                  </ReactMarkdown>
                </div>

                {sourceList.length > 0 && (
                  <div className="sources-card">
                    <h3>Research Sources</h3>
                    <div className="sources-list">
                      {sourceList.map((source, index) => (
                        <a
                          key={`${source.url}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="source-item"
                        >
                          <strong>{source.title}</strong>
                          <span>{source.snippet}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
