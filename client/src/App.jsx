import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import ForgotPassword from './components/ForgotPassword';
import ChatDashboard from './components/ChatDashboard';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* If the user goes to the base URL, send them to login */}
        <Route path="/" element={<Navigate to="/login" />} />
        
        {/* Our two new pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/chat" element={<ChatDashboard/>} />
      </Routes>
    </Router>
  );
}

export default App;