'use client';
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

/*
Colour scheme from the image:
- Main background: #f6f8fb (lightest subtle blue-grey)
- Sidebar: #111c44 (dark navy blue, but not used in login box)
- Primary buttons/accent: #ff9200 (strong orange)
- Accents (tabs borders): #0f7ffe, #c9dbff
- Headings/text: #313e6a (dark desaturated blue)
- Form background: #fff (white)
*/

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid credentials! Please try again.");
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "#f6f8fb",
      }}
    >
      {/* Decorative orange accent top right */}
      <div className="absolute top-0 right-0 w-52 h-52 bg-[#ff9200] rounded-bl-3xl blur-2xl opacity-20 z-0" />
      {/* Decorative blue bottom left */}
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#0f7ffe] rounded-tr-3xl blur-2xl opacity-10 z-0" />
      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-md p-10 bg-white/95 border border-[#c9dbff] rounded-2xl shadow-2xl"
        style={{
          boxShadow: "0 12px 32px 0 rgba(17,28,68,0.09)",
        }}
      >
        <div className="flex flex-col items-center mb-8">
          {/* Simple logo */}
          <svg viewBox="0 0 40 40" className="mb-2" width={48} height={48}>
            <circle cx="20" cy="20" r="20" fill="#ff9200" />
            <text x="50%" y="57%" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="bold" fontFamily="Arial">RH</text>
          </svg>
          <h1
            className="text-[2rem] font-extrabold text-center mb-2"
            style={{ color: "#313e6a", fontFamily: "Inter, Arial" }}
          >
            Researcher Login
          </h1>
          <p className="text-[#313e6a]/70 text-center text-sm max-w-xs">
            Please sign in to access your Research Hub dashboard.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label
              className="block font-semibold mb-1"
              htmlFor="email"
              style={{ color: "#313e6a" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              placeholder="Enter your email"
              className="w-full p-3 rounded-lg border border-[#c9dbff] text-base shadow-sm focus:outline-none focus:border-[#0f7ffe] focus:ring-2 focus:ring-[#0f7ffe]/40 caret-[#ff9200]"
              style={{
                background: "#f6f8fb",
                color: "#252525", // <--- Ensure black typing
                fontFamily: "Inter, Arial",
              }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label
              className="block font-semibold mb-1"
              htmlFor="password"
              style={{ color: "#313e6a" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="Enter your password"
              className="w-full p-3 rounded-lg border border-[#c9dbff] text-base shadow-sm focus:outline-none focus:border-[#0f7ffe] focus:ring-2 focus:ring-[#0f7ffe]/40 caret-[#ff9200]"
              style={{
                background: "#f6f8fb",
                color: "#252525", // <--- Ensure black typing
                fontFamily: "Inter, Arial",
              }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-[#b91c1c] bg-[#fff7f4] border border-[#fca5a5] rounded-lg p-2 px-3 text-sm text-center animate-shake font-semibold">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold transition-transform duration-150
              bg-gradient-to-tr from-[#ff9200] to-[#ffd580] text-white text-lg
              hover:from-[#ff9200] hover:to-[#0f7ffe] hover:scale-105
              shadow-md shadow-orange-100 focus:outline-none ${
                loading ? "opacity-60 cursor-not-allowed" : ""
              }
            `}
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
                <span>Signing In...</span>
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </div>
      </form>
    </main>
  );
}