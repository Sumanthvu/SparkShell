import { useState, useEffect, useRef } from 'react';
import { Menu, Plus, MessageSquare, Settings, Play, User, Send, X, Code, Terminal, PanelRightOpen, PanelRightClose, Paperclip, Mic, Copy, Check, Inbox, UserPlus, Shield, ShieldCheck, Users } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import axiosClient from '../api/axiosClient';
import { useNavigate } from 'react-router-dom';
import { getSocket, disconnectSocket } from '../socket/socketClient';

export default function ChatDashboard() {
  const navigate = useNavigate();
  const chatApiBase = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api/users').replace('/api/users', '/api/v1/chats');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState('owned');
  const [chats, setChats] = useState([]);
  const [sharedChats, setSharedChats] = useState([]);
  const [inboxInvites, setInboxInvites] = useState([]);
  const [activeChatId, setActiveChatId] = useState(() => localStorage.getItem('activeChatId'));
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('read');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [editorCode, setEditorCode] = useState('# Code editor ready\n');
  const chatContainerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  /* Keeps activeChatId accessible inside socket event closures */
  const activeChatIdRef = useRef(activeChatId);
  const typingQueueRef = useRef([]);
  const typingIntervalRef = useRef(null);
  const pendingAiDoneRef = useRef(null);
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

  const currentUserId = (() => {
    try {
      const rawUser = localStorage.getItem('user');
      if (!rawUser) return '';
      const parsed = JSON.parse(rawUser);
      return parsed?._id || parsed?.id || '';
    } catch {
      return '';
    }
  })();

  const isInboxView = sidebarView === 'inbox';
  const isSharedView = sidebarView === 'shared';
  const isOwnedView = sidebarView === 'owned';

  const allChats = [...chats, ...sharedChats];
  const activeChatMeta = allChats.find((item) => item._id === activeChatId);
  const canWriteCurrentChat = activeChatMeta
    ? activeChatMeta.accessLevel === 'owner' || activeChatMeta.accessLevel === 'write'
    : true;
  const canManageCollaborators = activeChatMeta?.accessLevel === 'owner';

  useEffect(() => {
    fetchChats();
    fetchSharedChats();
    fetchInboxInvites();
  }, []);

  useEffect(() => {
    if (activeChatId) fetchMessages(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    const sock = getSocket();
    sock.emit('join_chat', { chatId: activeChatId });
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('activeChatId', activeChatId);
    } else {
      localStorage.removeItem('activeChatId');
    }
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const finalizeAiMessage = ({ aiMessage, chatId }) => {
    setMessages((prev) => {
      const updated = [...prev];
      const idx = updated.findLastIndex((m) => m.isStreaming);
      if (idx >= 0) {
        updated[idx] = { ...aiMessage, isStreaming: false };
        return updated;
      }

      return [...updated, aiMessage];
    });

    if (!activeChatIdRef.current) {
      setActiveChatId(chatId);
      fetchChats();
    }

    setIsLoading(false);
    pendingAiDoneRef.current = null;
  };

  const stopTypingLoop = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  };

  const flushTypingQueue = () => {
    if (!typingQueueRef.current.length) {
      stopTypingLoop();
      if (pendingAiDoneRef.current) {
        finalizeAiMessage(pendingAiDoneRef.current);
      }
      return;
    }

    const batchSize = typingQueueRef.current.length > 260
      ? 14
      : typingQueueRef.current.length > 140
        ? 8
        : typingQueueRef.current.length > 60
          ? 4
          : 2;

    const nextSlice = typingQueueRef.current.splice(0, batchSize).join('');

    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => m.isStreaming);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          content: `${updated[idx].content || ''}${nextSlice}`,
        };
        return updated;
      }

      return [...prev, { senderRole: 'ai', content: nextSlice, isStreaming: true }];
    });
  };

  const ensureTypingLoop = () => {
    if (typingIntervalRef.current) return;

    typingIntervalRef.current = setInterval(() => {
      flushTypingQueue();
    }, 32);
  };

  /* ── Socket.io setup — connect once on mount, clean up on unmount ── */
  useEffect(() => {
    const sock = getSocket();
    sock.connect();

    const onChatCreated = ({ chatId }) => {
      setActiveChatId(chatId);
      fetchChats();
    };

    const onChatMessageCreated = ({ chatId, message }) => {
      if (!message?._id || !chatId) return;

      if (String(chatId) === String(activeChatIdRef.current)) {
        setMessages((prev) => {
          const exists = prev.some((item) => String(item?._id) === String(message._id));
          if (exists) return prev;
          return [...prev, message];
        });
      }

      fetchChats();
      fetchSharedChats();
    };

    const onInboxUpdated = () => {
      fetchInboxInvites();
    };

    const onSharedChatsUpdated = () => {
      fetchSharedChats();
      fetchChats();
    };

    const onChatUpdated = () => {
      fetchChats();
      fetchSharedChats();
    };

    const onAiChunk = ({ text }) => {
      setIsLoading(false);
      typingQueueRef.current.push(...Array.from(text || ''));
      ensureTypingLoop();
    };

    const onAiDone = ({ aiMessage, chatId }) => {
      if (typingQueueRef.current.length || typingIntervalRef.current) {
        pendingAiDoneRef.current = { aiMessage, chatId };
      } else {
        finalizeAiMessage({ aiMessage, chatId });
      }
    };

    const onAiError = ({ error }) => {
      typingQueueRef.current = [];
      pendingAiDoneRef.current = null;
      stopTypingLoop();
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findLastIndex((m) => m.isStreaming);
        if (idx >= 0) {
          updated[idx] = {
            senderRole: 'ai',
            content: `⚠️ ${error || 'Failed to generate AI response.'}`,
            isStreaming: false,
          };
        } else {
          updated.push({
            senderRole: 'ai',
            content: `⚠️ ${error || 'Failed to generate AI response.'}`,
          });
        }
        return updated;
      });
      setIsLoading(false);
    };

    sock.on('chat_created', onChatCreated);
    sock.on('chat_message_created', onChatMessageCreated);
    sock.on('inbox_updated', onInboxUpdated);
    sock.on('shared_chats_updated', onSharedChatsUpdated);
    sock.on('chat_updated', onChatUpdated);
    sock.on('ai_chunk', onAiChunk);
    sock.on('ai_done', onAiDone);
    sock.on('ai_error', onAiError);

    return () => {
      sock.off('chat_created', onChatCreated);
      sock.off('chat_message_created', onChatMessageCreated);
      sock.off('inbox_updated', onInboxUpdated);
      sock.off('shared_chats_updated', onSharedChatsUpdated);
      sock.off('chat_updated', onChatUpdated);
      sock.off('ai_chunk', onAiChunk);
      sock.off('ai_done', onAiDone);
      sock.off('ai_error', onAiError);
      typingQueueRef.current = [];
      pendingAiDoneRef.current = null;
      stopTypingLoop();
      disconnectSocket();
    };
  }, []);

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

      if (!activeChatId && chatList.length) {
        setActiveChatId(chatList[0]._id);
      }
    } catch (err) { console.error(err); }
  };

  const fetchSharedChats = async () => {
    try {
      const res = await axiosClient.get(`${chatApiBase}/shared`);
      const sharedList = res.data.data || [];
      setSharedChats(sharedList);

      if (!activeChatId && sharedList.length && chats.length === 0) {
        setActiveChatId(sharedList[0]._id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInboxInvites = async () => {
    try {
      const res = await axiosClient.get(`${chatApiBase}/invitations/inbox`);
      setInboxInvites(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshChatLists = async () => {
    await Promise.all([fetchChats(), fetchSharedChats(), fetchInboxInvites()]);
  };

  const sendInvite = async () => {
    if (!activeChatId || !inviteEmail.trim() || !canManageCollaborators || isSendingInvite) return;

    setIsSendingInvite(true);
    try {
      await axiosClient.post(`${chatApiBase}/${activeChatId}/invitations`, {
        email: inviteEmail.trim(),
        permission: invitePermission,
      });
      setInviteEmail('');
      setInvitePermission('read');
      setIsInviteModalOpen(false);
    } catch (err) {
      console.error(err);
      const serverMessage = err?.response?.data?.message || 'Failed to send invitation.';
      setMessages((prev) => [
        ...prev,
        { senderRole: 'ai', content: `⚠️ ${serverMessage}` },
      ]);
    } finally {
      setIsSendingInvite(false);
    }
  };

  const respondToInvite = async (inviteId, action) => {
    try {
      await axiosClient.post(`${chatApiBase}/invitations/${inviteId}/respond`, { action });
      await refreshChatLists();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (id) => {
    try {
      const res = await axiosClient.get(`${chatApiBase}/${id}`);
      setMessages(res.data.data);
    } catch (err) { console.error(err); }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isTextLikeFile = (file) => {
    const textMimePrefixes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/x-sh',
      'application/x-httpd-php'
    ];
    const textExtensions = [
      '.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.xml', '.yml', '.yaml', '.env', '.sh'
    ];

    if (textMimePrefixes.some((prefix) => file.type.startsWith(prefix))) return true;
    const lowerName = file.name.toLowerCase();
    return textExtensions.some((ext) => lowerName.endsWith(ext));
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const optimizeImageDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        try {
          const maxSide = 1280;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Canvas context unavailable'));
            return;
          }

          ctx.drawImage(image, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      image.src = objectUrl;
    });

  const handleFilesPicked = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const processed = await Promise.all(
      files.map(async (file) => {
        const relativePath = file.webkitRelativePath || file.name;
        const attachment = {
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          relativePath,
          type: file.type || 'application/octet-stream',
          size: file.size,
          previewDataUrl: null,
          textContent: null,
        };

        if ((file.type || '').startsWith('image/')) {
          try {
            attachment.previewDataUrl = await optimizeImageDataUrl(file);
          } catch {
            try {
              attachment.previewDataUrl = await readFileAsDataUrl(file);
            } catch {
              attachment.previewDataUrl = null;
            }
          }
          return attachment;
        }

        if (isTextLikeFile(file)) {
          try {
            const text = await file.text();
            attachment.textContent = text.slice(0, 6000);
          } catch {
            attachment.textContent = null;
          }
        }

        return attachment;
      })
    );

    setAttachedFiles((prev) => [...prev, ...processed].slice(0, 20));
    event.target.value = '';
  };

  const handleAttachClick = (event) => {
    if (event?.shiftKey) {
      folderInputRef.current?.click();
      return;
    }
    fileInputRef.current?.click();
  };

  const removeAttachment = (id) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if ((!inputMessage.trim() && !attachedFiles.length) || isLoading) return;

    if (activeChatId && !canWriteCurrentChat) {
      setMessages((prev) => [
        ...prev,
        {
          senderRole: 'ai',
          content: '⚠️ This shared chat is read-only for you. Ask the owner for write access.',
        },
      ]);
      return;
    }

    const userMsgContent = inputMessage.trim() || 'Please analyze the attached files/images.';
    const attachmentPayload = attachedFiles.map(({ id, ...rest }) => rest);
    const clientRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setInputMessage('');
    setAttachedFiles([]);
    typingQueueRef.current = [];
    pendingAiDoneRef.current = null;
    stopTypingLoop();
    /* Add the user bubble immediately; the AI streaming bubble appears on first chunk */
    setMessages((prev) => [
      ...prev,
      {
        senderRole: 'user',
        senderUserId: currentUserId,
        senderName: userName,
        content: userMsgContent,
        attachments: attachmentPayload,
      },
    ]);
    setIsLoading(true); // shows bounce until first ai_chunk arrives

    const sock = getSocket();
    sock.emit('send_message', {
      chatId: activeChatId,
      content: userMsgContent,
      attachments: attachmentPayload,
      clientRequestId,
    });
  };

  const handleLogout = async () => {
    try {
      await axiosClient.post('logout');
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('activeChatId');
      navigate('/login');
    }
  };

  /* ── Grok-style code block with language label + copy button ── */
  const extractText = (node) => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) return extractText(node.props.children);
    return '';
  };

  const GrokCodeBlock = ({ children, ...rest }) => {
    const [copied, setCopied] = useState(false);
    const codeEl = Array.isArray(children) ? children[0] : children;
    const rawClassName = codeEl?.props?.className || '';
    const language = rawClassName
      .split(' ')
      .find((c) => c.startsWith('language-'))
      ?.replace('language-', '') || '';
    const displayLang = language || 'code';
    const rawCode = extractText(codeEl?.props?.children);

    const handleCopy = () => {
      navigator.clipboard.writeText(rawCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="my-4 rounded-xl overflow-hidden border border-white/[0.08] bg-[#0d1017]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b24] border-b border-white/[0.08]">
          <span className="text-[12px] font-mono text-gray-400 select-none">{displayLang}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
        <div className="overflow-x-auto px-4 py-3.5">
          <pre className="m-0 text-[13.5px] leading-[1.6] font-mono whitespace-pre" {...rest}>{children}</pre>
        </div>
      </div>
    );
  };

  const mdComponents = {
    pre: GrokCodeBlock,
    p: ({ children }) => <p className="my-5 leading-[1.9] text-gray-100 whitespace-pre-line">{children}</p>,
    ul: ({ children }) => <ul className="my-5 pl-6 space-y-2.5 list-disc">{children}</ul>,
    ol: ({ children }) => <ol className="my-5 pl-6 space-y-3 list-decimal">{children}</ol>,
    li: ({ children }) => <li className="leading-[1.85]">{children}</li>,
    h1: ({ children }) => <h1 className="mt-8 mb-4 text-[24px] font-semibold text-white leading-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-7 mb-3.5 text-[21px] font-semibold text-white leading-tight">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-3 text-[18px] font-semibold text-white leading-tight">{children}</h3>,
    blockquote: ({ children }) => <blockquote className="my-5 border-l-2 border-white/20 pl-4 text-gray-300 italic">{children}</blockquote>,
  };

  /* ── Reusable inline copy button for full AI response ── */
  const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
      <button
        onClick={() => {
          navigator.clipboard.writeText(text || '').catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all"
      >
        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    );
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white flex" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(72,96,145,0.14),transparent_38%),linear-gradient(180deg,#040507_0%,#020203_100%)]" />
      </div>

      <div className="fixed inset-y-0 left-0 z-50 w-12 border-r border-white/10 bg-black/90 backdrop-blur-xl flex flex-col items-center py-4 gap-2">
        <button className={`h-9 w-9 rounded-xl text-gray-200 flex items-center justify-center transition-colors ${isSidebarOpen && isOwnedView ? 'bg-white/[0.12]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`} onClick={() => {
          if (isSidebarOpen && isOwnedView) {
            setIsSidebarOpen(false);
          } else {
            setSidebarView('owned');
            setIsSidebarOpen(true);
          }
        }}>
          <Menu size={20} />
        </button>

        <button
          onClick={() => {
            if (isSidebarOpen && isSharedView) {
              setIsSidebarOpen(false);
            } else {
              setSidebarView('shared');
              setIsSidebarOpen(true);
            }
          }}
          className={`relative h-9 w-9 rounded-xl text-gray-200 flex items-center justify-center transition-colors ${isSidebarOpen && isSharedView ? 'bg-white/[0.12]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}
          title="Shared chats"
        >
          <Users size={17} />
        </button>

        <button
          onClick={() => {
            if (isSidebarOpen && isInboxView) {
              setIsSidebarOpen(false);
            } else {
              setSidebarView('inbox');
              setIsSidebarOpen(true);
            }
          }}
          className={`relative h-9 w-9 rounded-xl text-gray-200 flex items-center justify-center transition-colors ${isInboxView && isSidebarOpen ? 'bg-white/[0.12]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}
          title="Inbox"
        >
          <Inbox size={17} />
          {inboxInvites.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-[10px] text-white flex items-center justify-center">
              {Math.min(inboxInvites.length, 9)}
            </span>
          )}
        </button>
      </div>

      <aside className={`fixed inset-y-0 left-12 z-40 w-[300px] transform border-r border-white/10 bg-[#0c0e13]/95 backdrop-blur-2xl transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-xl font-semibold tracking-tight text-white/95">{isInboxView ? 'Inbox' : isSharedView ? 'Shared chats' : 'Renzo'}</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"><X size={18} /></button>
        </div>

        {isOwnedView && (
          <div className="px-3 pt-3 space-y-1.5">
            <button
              onClick={() => { setActiveChatId(null); setMessages([]); setIsSidebarOpen(false); }}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-white/[0.05] border border-white/10 hover:bg-white/[0.1] transition-colors"
            >
              <Plus size={17} className="text-gray-200" />
              <span className="text-sm font-medium text-gray-100">New chat</span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-4 no-scrollbar smooth-scroll">
          {isInboxView ? (
            <div className="space-y-2">
              {inboxInvites.length === 0 ? (
                <p className="text-sm text-gray-400 px-2">No pending collaboration requests.</p>
              ) : (
                inboxInvites.map((invite) => (
                  <div key={invite._id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm text-white font-medium truncate">{invite.chatTitle || 'Shared chat invite'}</p>
                    <p className="text-xs text-gray-400 mt-1">From: {invite.inviter?.fullName || invite.inviter?.email}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Access: {invite.permission === 'write' ? 'Read + Write' : 'Read only'}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => respondToInvite(invite._id, 'accept')}
                        className="flex-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs py-1.5 hover:bg-blue-500/30 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respondToInvite(invite._id, 'reject')}
                        className="flex-1 rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-xs py-1.5 hover:bg-white/[0.08] transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : isOwnedView ? (
            <>
              <p className="px-2 mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">Your chats</p>
              <div className="space-y-1">
                {chats.map((chat) => (
                  <button
                    key={chat._id}
                    onClick={() => { setActiveChatId(chat._id); setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${activeChatId === chat._id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.05]'}`}
                  >
                    <MessageSquare size={15} className={`${activeChatId === chat._id ? 'text-white' : 'text-gray-500'}`} />
                    <span className="truncate text-sm">{chat.title}</span>
                  </button>
                ))}
              </div>

            </>
          ) : (
            <>
              <p className="px-2 mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">Shared chats</p>
              <div className="space-y-1">
                {sharedChats.length === 0 ? (
                  <p className="px-2 text-xs text-gray-500">No shared chats yet</p>
                ) : (
                  sharedChats.map((chat) => (
                    <button
                      key={chat._id}
                      onClick={() => { setActiveChatId(chat._id); setIsSidebarOpen(false); }}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${activeChatId === chat._id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.05]'}`}
                    >
                      {chat.accessLevel === 'write' ? <ShieldCheck size={15} className="text-blue-300" /> : <Shield size={15} className="text-gray-500" />}
                      <span className="truncate text-sm">{chat.title}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {isSidebarOpen && <div className="fixed inset-y-0 right-0 left-12 z-30 bg-black/45" onClick={() => setIsSidebarOpen(false)} />}

      <div className="relative z-10 flex flex-col flex-1 min-w-0 ml-12">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilesPicked}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={handleFilesPicked}
        />

        <header className="h-14 px-4 md:px-6 border-b border-white/10 bg-black/55 backdrop-blur-xl flex items-center justify-between">

          <div className="text-xs md:text-sm text-gray-400 truncate pr-3">
            {activeChatMeta ? (
              <span>
                {activeChatMeta.accessLevel === 'owner' ? 'Owner' : activeChatMeta.accessLevel === 'write' ? 'Shared • Read + Write' : 'Shared • Read only'}
              </span>
            ) : (
              <span>New chat</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {activeChatId && (
              <button
                onClick={() => canManageCollaborators && setIsInviteModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${canManageCollaborators ? 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]' : 'border-white/10 bg-white/[0.02] text-gray-500 cursor-not-allowed'}`}
                title={canManageCollaborators ? 'Add collaborator' : 'Only chat owner can add collaborators'}
              >
                <UserPlus size={16} />
                <span className="hidden sm:inline">Add collaborator</span>
              </button>
            )}

            <button
              onClick={() => setIsSandboxOpen(!isSandboxOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${isSandboxOpen ? 'border-blue-400/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'}`}
            >
              {isSandboxOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              <span className="hidden sm:inline">Sandbox</span>
            </button>

            <div className="relative" ref={profileMenuRef}>
              <button onClick={() => setIsProfileMenuOpen((prev) => !prev)} className="h-9 w-9 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                <User size={15} className="text-gray-200" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-11 w-56 rounded-xl border border-white/10 bg-[#1b1f28] shadow-2xl p-1.5 z-50">
                  <div className="px-3 py-2 text-sm text-gray-200 truncate border-b border-white/10">{userName}</div>
                  <button onClick={handleLogout} className="w-full text-left mt-1 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-white/5 transition-colors">Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar smooth-scroll">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="w-full max-w-3xl text-center -mt-10">
                <div className="mx-auto mb-4 h-32 w-90 md:h-36 md:w-96">
                  <img src="/temp/ui-logo.png" alt="Renzo logo" className="h-full w-full object-contain" />
                </div>
                {attachedFiles.length > 0 && (
                  <div className="mx-auto w-full max-w-[720px] mb-3 flex flex-wrap gap-2">
                    {attachedFiles.map((file) => (
                      <div key={file.id} className="relative group cursor-pointer flex flex-col items-center">
                        {file.previewDataUrl ? (
                          <img src={file.previewDataUrl} alt={file.name} className="h-20 w-20 object-cover rounded-xl border border-white/15" onClick={() => setPreviewImage(file.previewDataUrl)} />
                        ) : (
                          <div className="h-20 w-20 rounded-xl bg-[#0f1116] border border-white/10 flex items-center justify-center text-[10px] text-gray-400 px-1 text-center">{file.name}</div>
                        )}
                        <button type="button" onClick={() => removeAttachment(file.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-neutral-700 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <X size={10} />
                        </button>
                        <p className="mt-0.5 text-center text-[9px] text-gray-400 truncate w-20">{file.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="mx-auto relative w-full max-w-[720px] rounded-full border border-white/15 bg-[#0f1116]/88 backdrop-blur-xl">
                  <button type="button" title="Attach files/images (Shift+click for folder)" onClick={handleAttachClick} className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                    <Paperclip size={16} />
                  </button>
                  <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder={activeChatId && !canWriteCurrentChat ? "Read-only shared chat" : "What's on your mind?"} className="w-full bg-transparent pl-11 pr-28 py-3.5 text-[21px] leading-none text-gray-100 placeholder-gray-500 focus:outline-none" disabled={activeChatId && !canWriteCurrentChat} />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <button type="button" className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                      <Mic size={16} />
                    </button>
                    <button type="submit" disabled={(!inputMessage.trim() && !attachedFiles.length) || (activeChatId && !canWriteCurrentChat)} className="h-9 w-9 rounded-full bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-40 flex items-center justify-center">
                      <Send size={15} />
                    </button>
                  </div>
                </form>
                <p className="mt-6 text-[13px] text-gray-500">Renzo can make mistakes. Verify important information.</p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-8 pb-40 space-y-6">
              {messages.map((msg, idx) => {
                const isOwnUserMessage = msg.senderRole === 'user' && String(msg.senderUserId || '') === String(currentUserId);

                return (
                <div key={idx} className={`flex ${msg.senderRole === 'user' ? (isOwnUserMessage ? 'justify-end' : 'justify-start w-full') : 'justify-start w-full'}`}>
                  {msg.senderRole === 'user' ? (
                    /* ── User/collaborator prompt bubble ── */
                    <div className={`flex flex-col gap-1.5 max-w-[78%] ${isOwnUserMessage ? 'items-end' : 'items-start'}`}>
                      {!isOwnUserMessage && (
                        <p className="text-[11px] text-gray-500 px-1">{msg.senderName || 'Collaborator'}</p>
                      )}
                      {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                        <div className={`flex flex-wrap gap-2 ${isOwnUserMessage ? 'justify-end' : 'justify-start'}`}>
                          {msg.attachments.map((file, fileIdx) => (
                            <div key={`${file.name}-${fileIdx}`} className="relative group cursor-pointer flex flex-col items-center">
                              {file.previewDataUrl ? (
                                <img src={file.previewDataUrl} alt={file.name} className="h-28 w-28 object-cover rounded-xl border border-white/15 hover:opacity-90 transition-opacity" onClick={() => setPreviewImage(file.previewDataUrl)} />
                              ) : (
                                <div className="h-24 w-28 rounded-xl bg-[#1e2130] border border-white/10 flex items-center justify-center text-[10px] text-gray-400 px-2 text-center">{file.name}</div>
                              )}
                              <p className="mt-0.5 text-[9px] text-gray-500 truncate w-28 text-center">{file.name}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 text-gray-100 text-[15px] leading-[1.7] ${isOwnUserMessage ? 'bg-[#1e2130]' : 'bg-[#141822] border border-white/10'}`}>
                        {msg.content || ''}
                      </div>
                    </div>
                  ) : (
                    /* ── AI response — no box, plain text like Grok ── */
                    <div className="w-full group/ai">
                      <div className="text-[16px] leading-[1.9] tracking-[0.003em] text-gray-100
                        prose prose-invert max-w-none
                        prose-p:my-0 prose-p:text-gray-100 prose-p:leading-[1.9]
                        prose-headings:my-0 prose-headings:text-white prose-headings:font-semibold
                        prose-h1:text-[22px] prose-h2:text-[19px] prose-h3:text-[17px]
                        prose-ul:my-0 prose-ul:pl-0 prose-ol:my-0 prose-ol:pl-0
                        prose-li:my-0 prose-li:text-gray-100
                        prose-strong:text-white prose-strong:font-semibold
                        prose-em:text-gray-200
                        prose-hr:my-7 prose-hr:border-white/10
                        prose-blockquote:border-l-white/20 prose-blockquote:text-gray-300
                        prose-table:text-[14px] prose-th:text-gray-200 prose-td:text-gray-300
                        prose-code:text-blue-300 prose-code:text-[13.5px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                        prose-pre:p-0 prose-pre:bg-transparent prose-pre:my-0">
                        {msg.isStreaming ? (
                          <div className="whitespace-pre-wrap break-words leading-[1.9] text-gray-100">{msg.content || ''}</div>
                        ) : (
                          <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{msg.content || ''}</ReactMarkdown>
                        )}
                      </div>
                      {/* Copy entire response button — appears on hover */}
                      {!msg.isStreaming && msg.content && (
                        <div className="mt-2 opacity-0 group-hover/ai:opacity-100 transition-opacity">
                          <CopyButton text={msg.content} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );})}

              {isLoading && (
                <div className="flex justify-start w-full">
                  <div className="flex items-center gap-1.5 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '140ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '280ms' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {messages.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 px-4 md:px-6 pb-5 pt-10 bg-gradient-to-t from-black via-black/80 to-transparent">
            <div className="w-full max-w-3xl mx-auto">
              {attachedFiles.length > 0 && (
                <div className="mb-2 px-1 flex flex-wrap gap-2">
                  {attachedFiles.map((file) => (
                    <div key={file.id} className="relative group cursor-pointer flex flex-col items-center">
                      {file.previewDataUrl ? (
                        <img src={file.previewDataUrl} alt={file.name} className="h-20 w-20 object-cover rounded-xl border border-white/15" onClick={() => setPreviewImage(file.previewDataUrl)} />
                      ) : (
                        <div className="h-20 w-20 rounded-xl bg-[#0f1116] border border-white/10 flex items-center justify-center text-[10px] text-gray-400 px-1 text-center">{file.name}</div>
                      )}
                      <button type="button" onClick={() => removeAttachment(file.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-neutral-700 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <X size={10} />
                      </button>
                      <p className="mt-0.5 text-center text-[9px] text-gray-400 truncate w-20">{file.name}</p>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleSendMessage} className="relative rounded-full border border-white/15 bg-[#0f1116]/90 backdrop-blur-xl">
                <button type="button" title="Attach files/images (Shift+click for folder)" onClick={handleAttachClick} className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full text-gray-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                  <Paperclip size={16} />
                </button>
                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} placeholder={activeChatId && !canWriteCurrentChat ? "Read-only shared chat" : "What's on your mind?"} className="w-full bg-transparent pl-11 pr-28 py-3.5 text-[15px] text-gray-100 placeholder-gray-500 focus:outline-none" disabled={activeChatId && !canWriteCurrentChat} />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button type="button" className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                    <Mic size={16} />
                  </button>
                  <button type="submit" disabled={(!inputMessage.trim() && !attachedFiles.length) || (activeChatId && !canWriteCurrentChat)} className="h-9 w-9 rounded-full bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-40 flex items-center justify-center">
                    <Send size={15} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[190] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsInviteModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111520] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add collaborator</h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="h-8 w-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs text-gray-400 mb-2">Collaborator email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-white/10 bg-[#0d1119] px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-400/40"
            />

            <label className="block text-xs text-gray-400 mt-4 mb-2">Permission</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setInvitePermission('read')}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${invitePermission === 'read' ? 'border-blue-400/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]'}`}
              >
                Read
              </button>
              <button
                onClick={() => setInvitePermission('write')}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${invitePermission === 'write' ? 'border-blue-400/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]'}`}
              >
                Read + Write
              </button>
            </div>

            <button
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || isSendingInvite}
              className="mt-5 w-full rounded-xl bg-white text-black py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-200 transition-colors"
            >
              {isSendingInvite ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={() => setPreviewImage(null)}>
            <X size={20} />
          </button>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

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