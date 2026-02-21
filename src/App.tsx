import React, { useState, useEffect, useRef } from 'react';
import { User, Message } from './types';
import { Send, User as UserIcon, LogOut, Search, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(!localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) {
      fetchUsers();
      connectWs();
      // Try to restore user from local storage if available
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    }
  }, [token]);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
    }
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWs = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}`);
      
      socket.onopen = () => {
        console.log('WS Connected');
        socket.send(JSON.stringify({ type: 'auth', token: localStorage.getItem('token') }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'message') {
          const msg = data.message;
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      };

      socket.onclose = () => {
        console.log('WS Disconnected, retrying...');
        setTimeout(connectWs, 3000);
      };

      socket.onerror = (err) => {
        console.error('WS Error:', err);
      };

      setWs(socket);
    } catch (e) {
      console.error('Failed to connect WS:', e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Fetch users error:', e);
    }
  };

  const fetchMessages = async (otherId: number) => {
    try {
      const res = await fetch(`/api/messages/${otherId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Fetch messages error:', e);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response received:', text);
        throw new Error('Сервер вернул некорректный ответ. Попробуйте еще раз через несколько секунд.');
      }

      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setIsAuthOpen(false);
      } else {
        setError(data.error || 'Произошла ошибка при входе');
      }
    } catch (err) {
      console.error('Auth request failed:', err);
      setError('Не удалось связаться с сервером. Проверьте интернет-соединение.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setIsAuthOpen(true);
    if (ws) ws.close();
  };

  const sendMessage = (content: string) => {
    if (ws && activeChat && content.trim()) {
      ws.send(JSON.stringify({
        type: 'message',
        receiverId: activeChat.id,
        content
      }));
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isAuthOpen) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 glass rounded-3xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 mb-4 flex items-center justify-center">
              <img 
                src="https://logo-teka.com/wp-content/uploads/2025/07/max-messenger-sign-logo.svg" 
                alt="MAX Logo" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">MAX Messenger</h1>
            <p className="text-white/60 mt-2">Добро пожаловать в будущее</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Имя пользователя"
                autoComplete="username"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all disabled:opacity-50"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Пароль"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all disabled:opacity-50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            {error && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm text-center font-medium bg-red-400/10 py-2 rounded-lg border border-red-400/20"
              >
                {error}
              </motion.p>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  Подождите...
                </>
              ) : (
                authMode === 'login' ? 'Войти' : 'Создать аккаунт'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-white/60 hover:text-white text-sm transition-colors"
            >
              {authMode === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex p-4 gap-4 max-w-[1400px] mx-auto overflow-hidden">
      {/* Sidebar */}
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 glass rounded-3xl flex flex-col overflow-hidden"
      >
        <div className="p-4 border-bottom border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <img src={user?.avatar} className="w-10 h-10 rounded-full border border-white/20" alt="me" />
              <span className="text-white font-semibold">{user?.username}</span>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-all">
              <LogOut size={18} />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Поиск..."
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => setActiveChat(u)}
              className={cn(
                "w-full p-3 flex items-center gap-3 rounded-2xl transition-all group",
                activeChat?.id === u.id ? "bg-white/20" : "hover:bg-white/5"
              )}
            >
              <img src={u.avatar} className="w-12 h-12 rounded-full border border-white/10" alt={u.username} />
              <div className="flex-1 text-left">
                <div className="text-white font-medium">{u.username}</div>
                <div className="text-white/40 text-xs truncate">Нажмите, чтобы начать чат</div>
              </div>
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <div className="text-center text-white/40 py-8 text-sm">Пользователи не найдены</div>
          )}
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex-1 glass rounded-3xl flex flex-col overflow-hidden relative"
      >
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 glass-dark border-bottom border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={activeChat.avatar} className="w-10 h-10 rounded-full border border-white/20" alt={activeChat.username} />
                <div>
                  <div className="text-white font-semibold">{activeChat.username}</div>
                  <div className="text-emerald-400 text-xs flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    В сети
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex",
                      msg.sender_id === user?.id ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[70%] p-3 rounded-2xl text-sm shadow-lg",
                      msg.sender_id === user?.id 
                        ? "bg-indigo-500 text-white rounded-tr-none" 
                        : "glass-dark text-white rounded-tl-none"
                    )}>
                      {msg.content}
                      <div className="text-[10px] opacity-50 mt-1 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 glass-dark border-t border-white/10">
              <MessageInput onSend={sendMessage} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/40 p-8 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <MessageSquare size={40} />
            </div>
            <h2 className="text-xl font-semibold text-white/60">Выберите чат</h2>
            <p className="mt-2 max-w-xs">Выберите пользователя из списка слева, чтобы начать общение в MAX Messenger.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function MessageInput({ onSend }: { onSend: (content: string) => void }) {
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSend(content);
      setContent('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        placeholder="Напишите сообщение..."
        className="flex-1 px-4 py-3 bg-white/10 border border-white/10 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        type="submit"
        disabled={!content.trim()}
        className="p-3 bg-white text-indigo-600 rounded-2xl hover:bg-white/90 transition-all active:scale-90 disabled:opacity-50 disabled:scale-100"
      >
        <Send size={20} />
      </button>
    </form>
  );
}
