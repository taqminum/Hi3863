import { Car, Cloud, Lock, UserRound } from "lucide-react";
import { useState } from "react";
import { api, type User } from "../api";

const demoUsers: Record<string, { password: string; user: User }> = {
  admin: { password: "admin123", user: { id: "local-admin", username: "admin", displayName: "管理员", role: "admin" } },
  operator: { password: "operator123", user: { id: "local-operator", username: "operator", displayName: "巡检操作员", role: "operator" } },
  viewer: { password: "viewer123", user: { id: "local-viewer", username: "viewer", displayName: "观察员", role: "viewer" } }
};

export function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main className="login-screen">
      <section className="login-device">
        <div className="login-visual">
          <div className="login-brand-mark"><Car width={34} height={34} /></div>
          <h1>WS63E 控制台</h1>
          <p>星闪基站上云 · 环境巡检小车 · Web / APK 同源控制</p>
          <div className="login-link-map">
            <span>APP</span><i /><span><Cloud width={16} height={16} />云服务器</span><i /><span>H3863</span><i /><span>小车</span>
          </div>
        </div>
        <form className="login-panel" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setLoading(true);
          try {
            const result = await api.login(username, password);
            onLogin(result.token, result.user);
          } catch (err) {
            const demo = demoUsers[username];
            if (demo && demo.password === password) {
              onLogin(`local-demo:${demo.user.role}`, demo.user);
              return;
            }
            setError(err instanceof Error ? err.message : "登录失败");
          } finally {
            setLoading(false);
          }
        }}>
          <div>
            <h2>登录控制台</h2>
            <p>使用演示账号进入作品验收环境。</p>
          </div>
          <label><span><UserRound width={14} height={14} />账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label><span><Lock width={14} height={14} />密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <div className="login-demo-row">
            {Object.entries(demoUsers).map(([name, demo]) => (
              <button key={name} type="button" onClick={() => {
                setUsername(name);
                setPassword(demo.password);
              }}>{name}</button>
            ))}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "登录中..." : "进入控制台"}</button>
          <small>admin/admin123 · operator/operator123 · viewer/viewer123</small>
        </form>
      </section>
    </main>
  );
}
