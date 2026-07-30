"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getRedirectPathForRole } from "@/lib/roleRedirect";
import { useToast } from "@/components/ToastProvider";

const MIN_PASSWORD_LENGTH = 8;

function friendlySignInError(error) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  return error?.message || "Something went wrong signing you in. Please try again.";
}

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-16 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function SignInTab() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState(null);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus({ type: "error", message: friendlySignInError(error) });
      setLoading(false);
      return;
    }

    // Full navigation so /auth/redirect's server-rendered role check reads
    // the session cookie signInWithPassword just set, rather than racing a
    // client-side transition against it.
    window.location.href = "/auth/redirect";
  }

  async function handleMagicLinkSubmit(e) {
    e.preventDefault();
    setMagicLinkLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: magicLinkEmail }),
      });
      const body = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: body.error });
        return;
      }

      if (body.demo) {
        setVerifying(true);
        const { error } = await supabase.auth.verifyOtp({
          type: "email",
          token_hash: body.token_hash,
        });

        if (error) {
          setVerifying(false);
          setStatus({
            type: "error",
            message: "Something went wrong signing you in. Please try again.",
          });
          return;
        }

        window.location.href = getRedirectPathForRole(body.role);
        return;
      }

      setStatus({ type: "success", message: body.message });
    } catch {
      setStatus({
        type: "error",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setMagicLinkLoading(false);
    }
  }

  if (magicLinkMode) {
    return (
      <form onSubmit={handleMagicLinkSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="magic-email" className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="magic-email"
            type="email"
            required
            value={magicLinkEmail}
            onChange={(e) => setMagicLinkEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={magicLinkLoading || verifying}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {verifying ? "Signing you in..." : magicLinkLoading ? "Sending..." : "Send login link"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMagicLinkMode(false);
            setStatus(null);
          }}
          className="w-full text-center text-sm font-semibold text-indigo-600 hover:text-indigo-500"
        >
          Back to password sign in
        </button>

        {status && (
          <p
            className={`text-center text-sm ${
              status.type === "error" ? "text-red-600" : "text-green-600"
            }`}
          >
            {status.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <PasswordField
        id="password"
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />

      <div className="text-right">
        <Link href="/forgot-password" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      {status && (
        <p className="text-center text-sm text-red-600">{status.message}</p>
      )}

      <button
        type="button"
        onClick={() => {
          setMagicLinkMode(true);
          setStatus(null);
        }}
        className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
      >
        Or email me a login link
      </button>
    </form>
  );
}

function RegisterTab() {
  const { push } = useToast();
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function validate() {
    if (!form.companyName.trim()) return "Company name is required.";
    if (!form.contactName.trim()) return "Contact person name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.phone.trim()) return "Contact phone is required.";
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/vendors/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.companyName,
          contact_name: form.contactName,
          email: form.email,
          phone: form.phone,
          password: form.password,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Registration failed. Please try again.");
        return;
      }

      setSubmitted(true);
      push({ variant: "success", message: "Registration received — pending buyer approval." });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-md border border-green-200 bg-green-50 p-4 text-center text-sm text-green-800">
        Thanks for registering! Your account is pending buyer approval — we&apos;ll
        email you as soon as it&apos;s reviewed.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-slate-700">
          Company name
        </label>
        <input
          id="companyName"
          required
          value={form.companyName}
          onChange={update("companyName")}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="contactName" className="block text-sm font-medium text-slate-700">
          Contact person name
        </label>
        <input
          id="contactName"
          required
          value={form.contactName}
          onChange={update("contactName")}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="registerEmail" className="block text-sm font-medium text-slate-700">
          Email address
        </label>
        <input
          id="registerEmail"
          type="email"
          required
          value={form.email}
          onChange={update("email")}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
          Contact phone
        </label>
        <input
          id="phone"
          type="tel"
          required
          value={form.phone}
          onChange={update("phone")}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <PasswordField
        id="registerPassword"
        label="Password"
        value={form.password}
        onChange={update("password")}
        autoComplete="new-password"
      />
      <PasswordField
        id="confirmPassword"
        label="Confirm password"
        value={form.confirmPassword}
        onChange={update("confirmPassword")}
        autoComplete="new-password"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Submitting..." : "Register as vendor"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState("signin");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          ProcureBid
        </h1>

        <div className="mt-6 flex rounded-md border border-slate-200 bg-white p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              tab === "signin" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              tab === "register" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Register as vendor
          </button>
        </div>

        {tab === "signin" ? <SignInTab /> : <RegisterTab />}
      </div>
    </main>
  );
}
