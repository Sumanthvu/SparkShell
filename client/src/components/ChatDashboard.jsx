import { useState, useEffect, useRef } from 'react';
import { Menu, Plus, MessageSquare, Settings, Play, User, Send, X, Code, Terminal, ChevronDown, PanelRightOpen, PanelRightClose } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import axiosClient from '../api/axiosClient';
import { useNavigate } from 'react-router-dom';

export default function ChatDashboard() {
  const navigate = useNavigate();
  const chatApiBase = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api/users').replace('/api/users', '/api/v1/chats');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(() => localStorage.getItem('activeChatId'));
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editorCode, setEditorCode] = useState('# Code editor ready\n');
  const chatContainerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const userName = (() => {
    try {
      const rawUser = localStorage.getItem('user');
      if (!rawUser) return 'User';
      const parsedUser = JSON.parse(rawUser);
      return parsedUser?.fullName || parsedUser?.name || 'User';
    } catch {
      return 'User';
    }
  })();

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    if (activeChatId) fetchMessages(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('activeChatId', activeChatId);
    } else {
      localStorage.removeItem('activeChatId');
    }
  }, [activeChatId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const fetchChats = async () => {
    try {
      const res = await axiosClient.get(`${chatApiBase}`);
      const chatList = res.data.data || [];
      setChats(chatList);

      if (!chatList.length) {
        setActiveChatId(null);
        setMessages([]);
        return;
      }

      if (activeChatId) {
        const exists = chatList.some((chat) => chat._id === activeChatId);
        if (!exists) {
          setActiveChatId(chatList[0]._id);
        }
      }
    } catch (err) { console.error(err); }
  };

  const fetchMessages = async (id) => {
    try {
      const res = await axiosClient.get(`${chatApiBase}/${id}`);
      setMessages(res.data.data);
    } catch (err) { console.error(err); }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMsgContent = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { senderRole: 'user', content: userMsgContent }]);
    setIsLoading(true);

    try {
      const res = await axiosClient.post(`${chatApiBase}/send`, {
        chatId: activeChatId,
        content: userMsgContent
      });

      const { aiMessage, chatId } = res.data.data;
      setMessages(prev => [...prev, aiMessage]);
      if (!activeChatId) {
        setActiveChatId(chatId);
        fetchChats();
      }
    } catch (err) {
      console.error(err);
      const serverMessage = err?.response?.data?.message || "Unable to generate AI response right now. Please check server logs/config.";
      setMessages(prev => [
        ...prev,
        {
          senderRole: 'ai',
          content: `⚠️ ${serverMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axiosClient.post('/logout');
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('activeChatId');
      navigate('/login');
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0B0F19] text-white font-sans flex">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-[#111827]/95 backdrop-blur-2xl border-r border-white/5 transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 mb-2">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">SparkShell</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"><X size={20} /></button>
        </div>
        <div className="px-4 mb-6">
          <button onClick={() => { setActiveChatId(null); setMessages([]); setIsSidebarOpen(false); }} className="flex items-center gap-3 w-full p-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-all">
            <Plus size={18} /> <span className="font-medium">New Chat</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1 custom-scrollbar">
          <div className="text-xs font-semibold text-gray-500 mb-3 px-2 uppercase tracking-wider">Recent</div>
          {chats.map(chat => (
            <button key={chat._id} onClick={() => { setActiveChatId(chat._id); setIsSidebarOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all ${activeChatId === chat._id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
              <MessageSquare size={16} className={activeChatId === chat._id ? "text-blue-400" : "text-gray-500"} />
              <span className="truncate text-sm">{chat.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col flex-1 relative z-10 w-full overflow-hidden transition-all duration-300">
        <header className="flex items-center justify-between px-4 py-3 shrink-0 z-20 bg-[#0B0F19]/80 backdrop-blur-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"><Menu size={24} /></button>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSandboxOpen(!isSandboxOpen)} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-medium text-sm ${isSandboxOpen ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-300 border border-white/5 hover:bg-white/10'}`}>
              {isSandboxOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />} <span className="hidden sm:inline">Sandbox</span>
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                className="h-9 w-9 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px] hover:scale-105 transition-transform"
              >
                <div className="h-full w-full rounded-full bg-[#0B0F19] flex items-center justify-center"><User size={16} className="text-white" /></div>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-12 w-52 rounded-xl border border-white/10 bg-[#111827]/95 backdrop-blur-xl shadow-lg p-2 z-50">
                  <div className="px-3 py-2 text-sm text-gray-200 border-b border-white/10 truncate">{userName}</div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 mt-1 rounded-lg text-sm text-red-400 hover:bg-white/5 transition-colors"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth custom-scrollbar flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-3xl mx-auto w-full -mt-20">
              <h1 className="text-3xl md:text-4xl font-semibold mb-8 text-white/90 text-center tracking-tight">What will we build today?</h1>
              <form onSubmit={handleSendMessage} className="w-full relative flex items-center bg-[#1E293B]/60 border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] focus-within:border-blue-500/50 transition-all group">
                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder="Message SparkShell AI..." className="w-full bg-transparent text-white placeholder-gray-500 px-6 py-4 md:py-5 focus:outline-none text-base" />
                <button type="submit" className="absolute right-3 p-2.5 rounded-xl bg-white/10 hover:bg-blue-600 text-white transition-all group-focus-within:bg-blue-600"><Send size={18} /></button>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4 md:p-6 space-y-6 pb-40 max-w-4xl mx-auto w-full">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start items-start gap-4'}`}>
                  {msg.senderRole === 'ai' && (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)] mt-1">
                      <span className="text-white text-[10px] font-bold">AI</span>
                    </div>
                  )}
                  <div className={`max-w-[85%] ${msg.senderRole === 'user' ? 'p-4 rounded-2xl rounded-tr-sm bg-[#1E293B] border border-white/5' : 'p-2'}`}>
                    <div className="text-[15px] leading-relaxed prose prose-invert max-w-none">
                      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && <div className="p-4 flex gap-2"><div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"></div><div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce delay-150"></div><div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce delay-300"></div></div>}
            </div>
          )}
        </main>

        {messages.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/90 to-transparent pt-12 pb-6 px-4">
            <div className="max-w-3xl mx-auto relative">
              <form onSubmit={handleSendMessage} className="relative flex items-center bg-[#1E293B]/80 border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] focus-within:border-blue-500/50 transition-all group">
                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder="Message SparkShell AI..." className="w-full bg-transparent text-white placeholder-gray-400 px-6 py-4 focus:outline-none text-[15px]" />
                <button type="submit" disabled={!inputMessage.trim()} className="absolute right-2 p-2.5 rounded-xl bg-white/10 hover:bg-blue-600 text-white transition-all disabled:opacity-30 group-focus-within:bg-blue-600"><Send size={18} /></button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className={`border-l border-white/5 bg-[#0B0F19]/95 backdrop-blur-xl transition-all duration-300 ease-in-out flex flex-col shrink-0 ${isSandboxOpen ? 'w-full md:w-[45%] lg:w-[40%] translate-x-0' : 'w-0 translate-x-full opacity-0'}`}>
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-200 flex items-center gap-2"><Code size={18} className="text-blue-400" /> Workspace</h3>
            <button className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all text-sm font-medium"><Play size={14} fill="currentColor" /> Run Code</button>
          </div>
          <div className="flex-1 rounded-xl border border-white/10 bg-[#0D1117] overflow-hidden">
            <textarea value={editorCode} onChange={(e) => setEditorCode(e.target.value)} spellCheck="false" className="w-full h-full bg-transparent text-gray-300 font-mono text-[13px] leading-relaxed p-4 resize-none focus:outline-none custom-scrollbar" />
          </div>
          <div className="h-[30%] min-h-[150px] rounded-xl border border-white/10 bg-black/60 overflow-hidden">
            <div className="px-3 py-2 bg-white/5 border-b border-white/5 text-[11px] font-medium tracking-wider text-gray-400 uppercase flex gap-2 items-center"><Terminal size={14} /> Output</div>
            <div className="p-4 font-mono text-[12px] overflow-y-auto custom-scrollbar text-gray-400">$ Sandbox ready...</div>
          </div>
        </div>
      </div>
    </div>
  );
}