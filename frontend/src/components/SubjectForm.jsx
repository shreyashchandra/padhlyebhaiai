import { useState } from "react";
import { toast } from "sonner";
import api, { errorMessage } from "../lib/api";
import { cn, COLOR_NAMES, colorOf } from "../lib/utils";
import { Button, Field, Input, Modal } from "./ui";

const EMPTY = { name: "", exam_name: "", board_university: "", class_semester: "", exam_date: "", color: "indigo" };

export default function SubjectForm({ open, onClose, onSaved, subject }) {
  const [form, setForm] = useState(() => (subject ? { ...EMPTY, ...subject, exam_date: subject.exam_date || "" } : { ...EMPTY, color: COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)] }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      exam_name: form.exam_name?.trim() || null,
      board_university: form.board_university?.trim() || null,
      class_semester: form.class_semester?.trim() || null,
      exam_date: form.exam_date || null,
      color: form.color,
    };
    try {
      const { data } = subject ? await api.patch(`/api/subjects/${subject.id}`, payload) : await api.post("/api/subjects", payload);
      toast.success(subject ? "Subject updated" : "Subject added");
      onSaved?.(data);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? "Edit subject" : "Add a subject"}
      description="One subject per exam paper. The exam date powers your countdown and plan."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!form.name.trim()}>
            {subject ? "Save changes" : "Add subject"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject name *" className="sm:col-span-2">
          {(id) => <Input id={id} placeholder="e.g. Physics, Data Structures" value={form.name} onChange={set("name")} required />}
        </Field>
        <Field label="Exam date">{(id) => <Input id={id} type="date" value={form.exam_date} onChange={set("exam_date")} />}</Field>
        <Field label="Exam">{(id) => <Input id={id} placeholder="e.g. CBSE Boards, JEE Main, Sem 5" value={form.exam_name || ""} onChange={set("exam_name")} />}</Field>
        <Field label="Board / University">
          {(id) => <Input id={id} placeholder="e.g. CBSE, AKTU, Mumbai Univ." value={form.board_university || ""} onChange={set("board_university")} />}
        </Field>
        <Field label="Class / Semester">{(id) => <Input id={id} placeholder="e.g. Class 12, B.Tech Sem 3" value={form.class_semester || ""} onChange={set("class_semester")} />}</Field>
        <Field label="Colour" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {COLOR_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition", colorOf(c).dot, form.color === c ? "ring-2 ring-fg/60 scale-110" : "hover:scale-105")}
                style={form.color === c ? { "--tw-ring-color": "var(--text)" } : undefined}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
