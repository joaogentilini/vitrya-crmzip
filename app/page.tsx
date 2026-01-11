"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    setStatus("Entrando...");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setStatus(error ? `Erro: ${error.message}` : "Logado com sucesso");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  if (userEmail) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Vitrya CRM</h1>
        <p>Logado como: {userEmail}</p>

        <button onClick={signOut} style={{ padding: 10 }}>
          Sair
        </button>

        <hr style={{ margin: "24px 0" }} />

        <a href="/leads">Ir para Leads</a>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Vitrya CRM — Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      <input
        placeholder="Senha"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      <button onClick={signIn} style={{ width: "100%", padding: 10 }}>
        Entrar
      </button>

      <p style={{ marginTop: 12 }}>{status}</p>
    </main>
  );
}
