import { useState, useEffect, useRef } from 'react';
import { Menu, Plus, MessageSquare, Settings, Play, User, Send, X, Code, Terminal, ChevronDown, PanelRightOpen, PanelRightClose } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';

export default function ChatDashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editorCode, setEditorCode] = useState('# Code editor ready\n');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const tempUserMsg = { _id: Date.now(), senderRole: 'user', content: inputMessage };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputMessage('');
    setIsLoading(true);

    setTimeout(() => {
      const tempAiMsg = { 
        _id: Date.now() + 1, 
        senderRole: 'ai', 
        content: "I've fixed the UI bug! The navigation bar will now stay visible even after you send a message.\n\n```python\n# Navigation is now persistent\ndef check_ui():\n    return 'Fixed'\n```" 
      };
      setMessages((prev) => [...prev, tempAiMsg]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0B0F19] text-white font-sans flex">
      
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-screen"></div>
      </div>

      {/* LEFT SIDEBAR (DRAWER) */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-[#111827]/95 backdrop-blur-2xl border-r border-white/5 transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 mb-2">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">SparkShell</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 mb-6">
          <button onClick={() => {setMessages([]); setIsSidebarOpen(false);}} className="flex items-center gap-3 w-full p-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-all">
            <Plus size={18} />
            <span className="font-medium">New Chat</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1 custom-scrollbar">
          <div className="text-xs font-semibold text-gray-500 mb-3 px-2 uppercase tracking-wider">Recent</div>
          <button className="flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all text-gray-400 hover:bg-white/5 hover:text-white group">
            <MessageSquare size={16} className="text-gray-500 group-hover:text-blue-400" />
            <span className="truncate text-sm">Example Chat History</span>
          </button>
        </div>
        <div className="p-4 border-t border-white/5">
          <button className="flex items-center gap-3 w-full p-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all">
            <Settings size={18} />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-col flex-1 relative z-10 w-full overflow-hidden transition-all duration-300">
        
        {/* PERSISTENT HEADER (Always Visible) */}
        <header className="flex items-center justify-between px-4 py-3 shrink-0 z-20 bg-[#0B0F19]/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <Menu size={24} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSandboxOpen(!isSandboxOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-medium text-sm ${isSandboxOpen ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-300 border border-white/5 hover:bg-white/10'}`}
            >
              {isSandboxOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              <span className="hidden sm:inline">{isSandboxOpen ? 'Close Sandbox' : 'Open Sandbox'}</span>
            </button>
            <button className="h-9 w-9 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px] hover:scale-105 transition-transform">
              <div className="h-full w-full rounded-full bg-[#0B0F19] flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
            </button>
          </div>
        </header>

        {/* CHAT AREA */}
        <main ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth custom-scrollbar flex flex-col">
          {messages.length === 0 ? (
            /* EMPTY STATE */
            <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-3xl mx-auto w-full -mt-20">
              <h1 className="text-3xl md:text-4xl font-semibold mb-8 text-white/90 text-center tracking-tight">
                What will we build today?
              </h1>
              <form onSubmit={handleSendMessage} className="w-full relative flex items-center bg-[#1E293B]/60 border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] focus-within:border-blue-500/50 transition-all group">
                <input 
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Message SparkShell AI..."
                  className="w-full bg-transparent text-white placeholder-gray-500 px-6 py-4 md:py-5 focus:outline-none text-base"
                />
                <button type="submit" className="absolute right-3 p-2.5 rounded-xl bg-white/10 hover:bg-blue-600 text-white transition-all group-focus-within:bg-blue-600">
                  <Send size={18} />
                </button>
              </form>
            </div>
          ) : (
            /* ACTIVE CHAT STATE */
            <div className="flex-1 flex flex-col p-4 md:p-6 space-y-6 pb-40 max-w-4xl mx-auto w-full">
              {messages.map((msg, idx) => (
                <div key={msg._id || idx} className={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start items-start gap-4'}`}>
                  {msg.senderRole === 'ai' && (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)] mt-1">
                      <span className="text-white text-[10px] font-bold">AI</span>
                    </div>
                  )}
                  <div className={`max-w-[85%] ${msg.senderRole === 'user' ? 'p-4 rounded-2xl rounded-tr-sm bg-[#1E293B] border border-white/5' : 'p-2'}`}>
                    <div className={`text-[15px] leading-relaxed prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#0D1117] prose-pre:border prose-pre:border-white/10 max-w-none ${msg.senderRole === 'user' ? 'text-gray-100' : 'text-gray-200'}`}>
                      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start items-start gap-4">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-white text-[10px] font-bold">AI</span>
                  </div>
                  <div className="p-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* PERSISTENT INPUT BAR (Appears at bottom when chat is active) */}
        {messages.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/90 to-transparent pt-12 pb-6 px-4">
            <div className="max-w-3xl mx-auto relative">
              <form onSubmit={handleSendMessage} className="relative flex items-center bg-[#1E293B]/80 border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] focus-within:border-blue-500/50 transition-all group">
                <input 
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Message SparkShell AI..."
                  className="w-full bg-transparent text-white placeholder-gray-400 px-6 py-4 focus:outline-none text-[15px]"
                />
                <button type="submit" disabled={!inputMessage.trim()} className="absolute right-2 p-2.5 rounded-xl bg-white/10 hover:bg-blue-600 text-white transition-all disabled:opacity-30 group-focus-within:bg-blue-600">
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* SANDBOX PANEL */}
      <div className={`border-l border-white/5 bg-[#0B0F19]/95 backdrop-blur-xl transition-all duration-300 ease-in-out flex flex-col shrink-0 ${isSandboxOpen ? 'w-full md:w-[45%] lg:w-[40%] translate-x-0' : 'w-0 translate-x-full border-none opacity-0'}`}>
        <div className="flex-1 flex flex-col p-4 gap-4 h-full overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-200 flex items-center gap-2">
              <Code size={18} className="text-blue-400" /> Workspace
            </h3>
            <button className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all text-sm font-medium">
              <Play size={14} fill="currentColor" /> Run Code
            </button>
          </div>

          <div className="flex-1 flex flex-col rounded-xl border border-white/10 bg-[#0D1117] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5">
              <span className="text-xs font-medium text-gray-400 font-mono">main.py</span>
            </div>
            <textarea
              value={editorCode}
              onChange={(e) => setEditorCode(e.target.value)}
              spellCheck="false"
              className="flex-1 w-full bg-transparent text-gray-300 font-mono text-[13px] leading-relaxed p-4 resize-none focus:outline-none custom-scrollbar"
            />
          </div>

          <div className="h-[30%] min-h-[150px] flex flex-col rounded-xl border border-white/10 bg-black/60 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/5">
              <Terminal size={14} className="text-gray-400" />
              <span className="text-[11px] font-medium tracking-wider text-gray-400 uppercase">Output</span>
            </div>
            <div className="flex-1 p-4 font-mono text-[12px] overflow-y-auto custom-scrollbar text-gray-400">
              $ Ready to execute code...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}