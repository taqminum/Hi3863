import { Car } from "lucide-react";
import { useState } from "react";
import { api, type User } from "../api";

export function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  return (
    <main className="login">
      <section>
        <div className="brand login-brand"><Car size={30} /><strong>WS63 环境巡检平台</strong></div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const result = await api.login(username, password);
            onLogin(result.token, result.user);
          } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
          }
        }}>
          <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit">登录控制台</button>
          <small>演示账号：admin/admin123 · operator/operator123 · viewer/viewer123</small>
        </form>
      </section>
    </main>
  );
}
