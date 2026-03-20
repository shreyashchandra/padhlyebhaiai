import { useRef, useState } from "react";
import axios from "axios";
import html2pdf from "html2pdf.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Brain,
  CalendarDays,
  Clock3,
  Download,
  FileText,
  Globe2,
  GraduationCap,
  Link2,
  RefreshCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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

  const toggleStudyDay = (day) => {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSourceFile(null);
      return;
    }

    const validTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ];

    const validExtensions = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];
    const lowerName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some((ext) =>
      lowerName.endsWith(ext),
    );

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setError("Only PNG, JPG, JPEG, WEBP, and PDF files are supported.");
      setSourceFile(null);
      return;
    }

    setError("");
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

      const response = await axios.post(
        `${API_BASE_URL}/api/study-plan`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setResult(response.data);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Something went wrong while generating the plan.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!resultRef.current) return;

    const options = {
      margin: [0.35, 0.35, 0.35, 0.35],
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
    };

    html2pdf().set(options).from(resultRef.current).save();
  };

  const handleReset = () => {
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
    setError("");
    setResult(null);
  };

  const topicList = result?.syllabus_outline?.all_topics || [];
  const unitList = result?.syllabus_outline?.units || [];
  const sourceList = result?.research_sources || [];

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-content">
          <div className="hero-badges">
            <span className="badge">
              <Sparkles size={14} />
              AI Study Planner
            </span>
            <span className="badge">
              <Globe2 size={14} />
              Web Research Enabled
            </span>
            <span className="badge">
              <FileText size={14} />
              Image + PDF Support
            </span>
          </div>

          <h1>PadhLyeBhaiAI</h1>
          <p>
            Upload your syllabus, let AI analyze it, research the exam on the
            internet, prioritize the important topics, and generate a realistic
            timetable you can actually follow.
          </p>
        </div>

        <div className="hero-glow" />
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
                <UploadCloud size={16} />
                Upload File
              </button>

              <button
                type="button"
                className={inputMode === "url" ? "mode active" : "mode"}
                onClick={() => setInputMode("url")}
              >
                <Link2 size={16} />
                Image URL
              </button>
            </div>

            {inputMode === "upload" ? (
              <div className="upload-box">
                <label htmlFor="sourceFile" className="upload-label">
                  <UploadCloud size={18} />
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
                  <div className="file-chip">
                    <FileText size={15} />
                    {sourceFile.name}
                  </div>
                )}
              </div>
            ) : (
              <div className="field">
                <label>
                  <Link2 size={15} />
                  Image URL
                </label>
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
              <p>Give context so the AI researches the right exam properly.</p>
            </div>

            <div className="grid">
              <div className="field">
                <label>
                  <GraduationCap size={15} />
                  Exam Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. CBSE Board Exam, GATE, End Semester Exam"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>
                  <BookOpen size={15} />
                  Board / University / Course
                </label>
                <input
                  type="text"
                  placeholder="e.g. CBSE, AKTU, VTU, JNTUH"
                  value={boardUniversity}
                  onChange={(e) => setBoardUniversity(e.target.value)}
                />
              </div>

              <div className="field">
                <label>
                  <CalendarDays size={15} />
                  Class / Semester
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class 12, Semester 4"
                  value={classSemester}
                  onChange={(e) => setClassSemester(e.target.value)}
                />
              </div>

              <div className="field">
                <label>
                  <Brain size={15} />
                  Subject Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>
                  <Sparkles size={15} />
                  Preparation Mode
                </label>
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
                <label>
                  <Globe2 size={15} />
                  Enable Web Research
                </label>
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
                <label>
                  <Clock3 size={15} />
                  Daily Study Time (hours)
                </label>
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
                <label>
                  <CalendarDays size={15} />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label>
                  <CalendarDays size={15} />
                  End Date
                </label>
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
              <p>Because 8 hours straight sounds inspiring and illegal.</p>
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
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading
                  ? "Generating your timetable..."
                  : "Generate Timetable"}
              </button>

              <button
                type="button"
                className="download-btn secondary"
                onClick={handleReset}
                disabled={loading}
              >
                <RefreshCcw size={16} />
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
              Smart schedule, topic prioritization, and internet-backed exam
              insights.
            </p>
          </div>

          {!result && !loading && (
            <div className="placeholder">
              <Sparkles size={32} />
              <h3>No timetable yet</h3>
              <p>
                Upload a syllabus, set your preferences, and let the AI do the
                academically dramatic part.
              </p>
            </div>
          )}

          {loading && (
            <div className="placeholder">
              <Sparkles size={32} className="spin" />
              <h3>Cooking your study plan...</h3>
              <p>
                Reading syllabus, researching the exam, and trying not to
                overwork your future self.
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
                  <Download size={16} />
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

                {topicList.length > 0 && (
                  <div className="topics-card">
                    <h3>Extracted Topics</h3>
                    <div className="topics-list">
                      {topicList.slice(0, 20).map((topic, index) => (
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
                      {unitList.slice(0, 8).map((unit, index) => (
                        <div
                          key={`${unit.name}-${index}`}
                          className="unit-item"
                        >
                          <strong>{unit.name || `Unit ${index + 1}`}</strong>
                          {Array.isArray(unit.topics) &&
                            unit.topics.length > 0 && (
                              <p>{unit.topics.slice(0, 5).join(", ")}</p>
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
