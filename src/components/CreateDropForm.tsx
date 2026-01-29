"use client";

import { useState, useCallback } from "react";
import { Button, Input, Select } from "./ui";
import { isValidUrl } from "@/lib/utils";
import type { DropKind, CreateDropInput } from "@/lib/types";

interface CreateDropFormProps {
  onSubmit: (input: CreateDropInput) => void;
  isLoading?: boolean;
}

const TTL_OPTIONS = [
  { value: String(10 * 1000), label: "10 seconds" },
  { value: String(1 * 60 * 1000), label: "1 minute" },
  { value: String(5 * 60 * 1000), label: "5 minutes" },
  { value: String(10 * 60 * 1000), label: "10 minutes" },
  { value: String(30 * 60 * 1000), label: "30 minutes" },
  { value: String(60 * 60 * 1000), label: "1 hour" },
  { value: String(6 * 60 * 60 * 1000), label: "6 hours" },
  { value: String(24 * 60 * 60 * 1000), label: "1 day" },
  { value: String(7 * 24 * 60 * 60 * 1000), label: "7 days" },
];

const KIND_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "url", label: "Redirect URL" },
];

export function CreateDropForm({ onSubmit, isLoading }: CreateDropFormProps) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DropKind>("text");
  const [body, setBody] = useState("");
  const [ttlMs, setTtlMs] = useState(10 * 60 * 1000);
  const [maxViews, setMaxViews] = useState(1);
  const [errors, setErrors] = useState<{ title?: string; body?: string; maxViews?: string }>({});

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!title.trim()) {
      newErrors.title = "Title is required";
    }

    if (!body.trim()) {
      newErrors.body = kind === "url" ? "URL is required" : "Content is required";
    } else if (kind === "url" && !isValidUrl(body.trim())) {
      newErrors.body = "Please enter a valid URL (http:// or https://)";
    }

    if (maxViews < 1 || maxViews > 1000) {
      newErrors.maxViews = "Max views must be between 1 and 1000";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [title, body, kind, maxViews]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    onSubmit({
      title: title.trim(),
      body: body.trim(),
      ttlMs,
      maxViews,
      kind,
    });

    // Reset form
    setTitle("");
    setBody("");
    setMaxViews(1);
    setErrors({});
  }, [title, body, ttlMs, maxViews, kind, validate, onSubmit]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        autoComplete="off"
      />

      <div className="flex gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as DropKind)}
          options={KIND_OPTIONS}
          className="w-36"
        />
        <Select
          value={String(ttlMs)}
          onChange={(e) => setTtlMs(Number(e.target.value))}
          options={TTL_OPTIONS}
          className="flex-1"
        />
        <Input
          type="number"
          min={1}
          max={1000}
          value={maxViews}
          onChange={(e) => setMaxViews(parseInt(e.target.value || "1", 10))}
          error={errors.maxViews}
          className="w-24"
          placeholder="Views"
          title="Maximum views"
        />
      </div>

      <div>
        <textarea
          className={`w-full h-28 px-3 py-2 bg-white/5 border rounded-lg text-white placeholder-white/40 resize-none
            focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent
            ${errors.body ? "border-red-500/50" : "border-white/10"}`}
          placeholder={kind === "url" ? "https://example.com" : "Enter your secret message..."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {errors.body && <p className="mt-1 text-sm text-red-400">{errors.body}</p>}
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isLoading}
          disabled={!title.trim() || !body.trim()}
        >
          Create Drop
        </Button>
      </div>
    </div>
  );
}
