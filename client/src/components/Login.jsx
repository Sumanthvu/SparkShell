import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import axiosClient from "../api/axiosClient";
import { GoogleLogin } from "@react-oauth/google";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axiosClient.post("/login", formData);
      toast.success(response.data.message || "Logged in successfully!");
      localStorage.setItem("user", JSON.stringify(response.data.data.user));
      setTimeout(() => navigate("/chat"), 1500);
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="max-w-md w-full bg-gray-900/80 backdrop-blur-xl border border-gray-800 p-8 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.1)] transform transition-all duration-500 hover:shadow-[0_0_60px_rgba(139,92,246,0.15)] hover:-translate-y-2">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Log in to Renzo to continue.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email Field */}
          <div className="relative group">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-500 transition-colors"
              size={20}
            />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email Address"
              required
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Password Field */}
          <div className="relative group">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-purple-500 transition-colors"
              size={20}
            />
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Password"
              required
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>

          <div className="my-4 flex items-center before:mt-0.5 before:flex-1 before:border-t before:border-gray-700 after:mt-0.5 after:flex-1 after:border-t after:border-gray-700">
            <p className="mx-4 mb-0 text-center text-sm font-semibold text-gray-500">
              OR
            </p>
          </div>

          <div className="flex justify-center w-full">
            <GoogleLogin
              theme="filled_black" // Matches your dark UI!
              size="large"
              shape="pill"
              onSuccess={async (credentialResponse) => {
                try {
                  setLoading(true);
                  // Send the Google token to our new backend route
                  const response = await axiosClient.post("/google-login", {
                    credential: credentialResponse.credential,
                  });

                  toast.success("Logged in with Google!");
                  localStorage.setItem(
                    "user",
                    JSON.stringify(response.data.data.user),
                  );
                  setTimeout(() => navigate("/chat"), 1500);
                } catch (error) {
                  toast.error("Google Login Failed");
                } finally {
                  setLoading(false);
                }
              }}
              onError={() => {
                toast.error("Google Sign In was unsuccessful");
              }}
            />
          </div>

          <div className="flex justify-end mt-2">
            <Link
              to="/forgot-password"
              className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-semibold py-3 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.4)]"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="text-purple-500 hover:text-purple-400 font-medium transition-colors"
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
