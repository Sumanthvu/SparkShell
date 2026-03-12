import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, KeyRound } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axiosClient from '../api/axiosClient';

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Details, 2: OTP
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    otp: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axiosClient.post('/register', {
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password
      });
      toast.success(response.data.message || 'OTP sent to your email!');
      setStep(2);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axiosClient.post('/verify-otp', {
        email: formData.email,
        otp: formData.otp
      });
      toast.success('Account created successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 perspective-1000">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="max-w-md w-full bg-gray-900/80 backdrop-blur-xl border border-gray-800 p-8 rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.1)] transform transition-all duration-500 hover:shadow-[0_0_60px_rgba(59,130,246,0.15)] hover:-translate-y-2">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Join ⚡ Renzo</h1>
          <p className="text-gray-400">
            {step === 1 ? 'Create your account to start compiling.' : 'Check your email for the verification code.'}
          </p>
        </div>

        <form onSubmit={step === 1 ? handleRequestOtp : handleVerifyOtp} className="space-y-5">
          {step === 1 ? (
            <>
              {/* Name Field */}
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="Full Name" 
                  required
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Email Field */}
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Email Address" 
                  required
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Password Field */}
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  type="password" 
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Password" 
                  required
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </>
          ) : (
            <>
              {/* OTP Field */}
              <div className="relative group animate-pulse">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  name="otp"
                  value={formData.otp}
                  onChange={handleChange}
                  placeholder="Enter 6-digit OTP" 
                  required
                  className="w-full bg-gray-950 border border-blue-500 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all tracking-widest text-center"
                />
              </div>
            </>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
          >
            {loading ? 'Processing...' : (step === 1 ? 'Sign Up' : 'Verify & Enter')}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
            Log in here
          </Link>
        </div>

      </div>
    </div>
  );
}