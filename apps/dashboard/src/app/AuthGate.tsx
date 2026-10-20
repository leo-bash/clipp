"use client";

import { useEffect, useState } from "react";

type AuthState = "checking" | "signed-out" | "signed-in";

export default function AuthGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [state, setState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${apiUrl}/api/v1/auth/session`, { credentials: "include" })
      .then((response) => setState(response.ok ? "signed-in" : "signed-out"))
      .catch(() => { setMessage("The local server is not reachable."); setState("signed-out"); });
  }, [apiUrl]);

  async function login(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { setMessage(response.status === 503 ? "Server authentication is not configured yet." : "Password not accepted."); return; }
      setPassword("");
      setState("signed-in");
    } catch { setMessage("The local server is not reachable."); }
  }

  async function logout(): Promise<void> {
    await fetch(`${apiUrl}/api/v1/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setState("signed-out");
  }

  if (state === "checking") return <main className="auth-screen"><p className="eyebrow">SHORTFACTORY</p><p className="muted">Checking secure session…</p></main>;
  if (state === "signed-out") return <main className="auth-screen"><form className="auth-card" onSubmit={(event) => void login(event)}><p className="eyebrow">SHORTFACTORY / PRIVATE</p><h1>Welcome back.</h1><p className="lede">Enter the server password to open the operations dashboard.</p><label>Password<input autoFocus required type="password" value={password} onChange={(event) => setPassword((event.currentTarget as unknown as { value: string }).value)} /></label><button type="submit">Unlock dashboard</button>{message ? <p className="error-text" role="alert">{message}</p> : null}</form></main>;
  return <><div className="session-bar"><span>Private session active</span><button type="button" onClick={() => void logout()}>Disconnect</button></div>{children}</>;
}
