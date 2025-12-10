import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Heart, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { buildSnapshot, evaluateUiState, DEFAULT_UI_FLAGS } from './uiState';
import { UIFiniteStateMachine, UI_MODES, deriveMode } from './uiFsm';

const MOCK_CARS = {
  initial: [
    { id: 1, name: "Markt-Scan läuft", price: "---", img: "🔍", tag: "Suche..." },
    { id: 2, name: "Analyse", price: "---", img: "⚙️", tag: "Warte auf Input" },
  ],
  dealer: [
    { id: 3, name: "VW Tiguan 2.0", price: "18.900 €", img: "🚙", tag: "Top Händler" },
    { id: 4, name: "Audi Q3", price: "22.500 €", img: "🚙", tag: "Garantie" },
    { id: 5, name: "BMW X1", price: "19.800 €", img: "🚙", tag: "Scheckheft" },
  ],
  private: [
    { id: 6, name: "Mazda CX-5", price: "14.500 €", img: "🚙", tag: "VB" },
    { id: 7, name: "Ford Kuga", price: "16.200 €", img: "🚙", tag: "1. Hand" },
  ]
};

const FAVORITES_KEY = 'dfapp:favorites';

const DEFAULT_PROFILE = {
  budget_level: "flexible",
  usage_pattern: "mixed",
  size_preference: "no_preference",
  design_vibe: [],
  comfort_importance: "medium",
  tech_importance: "medium",
  risk_profile: "balanced",
  explicit_brands_likes: [],
  explicit_brands_dislikes: [],
  deal_breakers: [],
};

const getOfferId = (offer = {}) => {
  const raw = offer.id || offer.vin || offer.model || offer.title || "";
  if (raw) return String(raw);
  const badge = offer.badge ? `-${offer.badge}` : "";
  return `offer-${(offer.model || offer.title || "id")}${badge}`.replace(/\s+/g, "-").toLowerCase();
};

const normalizeOfferForUi = (offer = {}) => ({
  ...offer,
  id: getOfferId(offer),
});

const profileToBadges = (profile) => {
  if (!profile) return { chips: [], breakers: [] };
  const chips = [];
  const breakers = [];
  const budgetLabels = { low: "Budget-freundlich", medium: "mittleres Budget", high: "bereit zu investieren", flexible: "" };
  const usageLabels = { city: "Stadt", mixed: "Mix", long_distance: "Langstrecke" };
  const sizeLabels = { small: "Kleinwagen", compact: "Kompakt", midsize: "Kombi", suv: "SUV", van: "Van", no_preference: "" };

  if (profile.budget_level && profile.budget_level !== DEFAULT_PROFILE.budget_level) {
    chips.push(`Budget: ${budgetLabels[profile.budget_level] || profile.budget_level}`);
  }
  if (profile.usage_pattern && profile.usage_pattern !== DEFAULT_PROFILE.usage_pattern) {
    chips.push(`Nutzung: ${usageLabels[profile.usage_pattern] || profile.usage_pattern}`);
  }
  if (profile.size_preference && profile.size_preference !== DEFAULT_PROFILE.size_preference) {
    chips.push(`Größe: ${sizeLabels[profile.size_preference] || profile.size_preference}`);
  }
  if (Array.isArray(profile.design_vibe) && profile.design_vibe.length > 0) {
    chips.push(`Vibe: ${profile.design_vibe.slice(0, 2).join(", ")}`);
  }
  if (profile.comfort_importance === "high") chips.push("Mag Komfort");
  if (profile.tech_importance === "high") chips.push("Tech-affin");
  if (profile.risk_profile === "conservative") chips.push("Risiko: vorsichtig");
  if (Array.isArray(profile.explicit_brands_likes) && profile.explicit_brands_likes.length > 0) {
    chips.push(`Mag ${profile.explicit_brands_likes.slice(0, 2).join(", ")}`);
  }
  if (Array.isArray(profile.explicit_brands_dislikes) && profile.explicit_brands_dislikes.length > 0) {
    breakers.push(`Meidet ${profile.explicit_brands_dislikes.slice(0, 2).join(", ")}`);
  }
  if (Array.isArray(profile.deal_breakers) && profile.deal_breakers.length > 0) {
    breakers.push(profile.deal_breakers.slice(0, 2).join(", "));
  }

  return { chips, breakers };
};

const isDefaultProfile = (profile) => {
  if (!profile) return true;
  return (
    profile.budget_level === DEFAULT_PROFILE.budget_level &&
    profile.usage_pattern === DEFAULT_PROFILE.usage_pattern &&
    profile.size_preference === DEFAULT_PROFILE.size_preference &&
    (profile.design_vibe || []).length === 0 &&
    (profile.explicit_brands_likes || []).length === 0 &&
    (profile.explicit_brands_dislikes || []).length === 0 &&
    (profile.deal_breakers || []).length === 0
  );
};

/*
Component: ChatMessage
- Props: msg { sender: 'bot'|'user', text: string }
- Mobile behavior: full-width stacked bubbles, 90% max width on small screens with comfortable padding.
- Fallback behavior: text-only rendering; works without images.
- Accessibility: readable contrast, large tap area via generous padding.
- Breakpoints: sm default; tighter max width on md+.
- Performance: simple render-only component; minimal motion.
*/
const ChatMessage = ({ msg }) => {
  const isBot = msg.sender === 'bot';
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full mb-3 ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div className={`max-w-[90%] md:max-w-[75%] p-3 rounded-2xl relative shadow-sm ${
        isBot ? 'bg-white border border-gray-200 text-gray-800' : 'bg-blue-600 text-white'
      }`}>
        <p className="pr-12 break-words">{msg.text}</p>
      </div>
    </motion.div>
  );
};

/*
Component: OfferCard
- Props: offer (data), onImageError callback, renderTextOnly boolean for degraded mode.
- Mobile behavior: single-column cards with responsive spacing; touch targets padded to 44px+.
- Fallback behavior: text-only mode, placeholder for missing/broken images, link kept accessible.
- Accessibility: clear headings, focusable links, readable contrast.
- Breakpoints & Layout: sm one-column, md two-column grid via parent; card adapts width fluidly.
- Performance: lightweight card, lazy image fallback via onError, avoids heavy nesting.
*/
const OfferCard = ({ offer, onImageError, renderTextOnly, onToggleFavorite, isFavorite }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-2"
  >
    <div className="flex gap-3">
      {!renderTextOnly && (
        <div className="h-24 w-28 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-600 overflow-hidden">
          {offer.image_url ? (
            <img
              src={offer.image_url}
              alt={offer.title || "Fahrzeug"}
              className="object-cover h-full w-full rounded"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "";
                onImageError?.(offer);
              }}
            />
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
              Bild folgt
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-sm leading-tight line-clamp-2 text-gray-900">{offer.title || offer.model}</h3>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite?.(offer);
            }}
            aria-label="Favorisieren"
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
          >
            <Heart size={16} className={isFavorite ? "text-red-500 fill-red-500" : "text-gray-300"} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
          {offer.dealer && <span className="font-medium text-gray-700">{offer.dealer}</span>}
          {offer.badge && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{offer.badge}</span>}
          {offer.is_hidden_gem && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full inline-flex items-center gap-1">
              <Sparkles size={12} /> Geheimtipp
            </span>
          )}
        </div>
        {offer.why && <p className="text-xs text-gray-800 line-clamp-2">{offer.why}</p>}
      </div>
    </div>

    {Array.isArray(offer.fit_reasons) && offer.fit_reasons.length > 0 && (
      <ul className="text-[12px] text-gray-700 list-disc pl-4 space-y-1">
        {offer.fit_reasons.slice(0, 3).map((reason, idx) => (
          <li key={idx} className="leading-snug">{reason}</li>
        ))}
      </ul>
    )}
    {offer.tip && <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-100 px-2 py-1 rounded">{offer.tip}</div>}
    {offer.caution && <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 px-2 py-1 rounded">{offer.caution}</div>}

    <div className="flex items-center justify-between text-[11px] text-gray-600">
      <div className="flex flex-wrap gap-1">
        {Array.isArray(offer.tags) && offer.tags.slice(0, 3).map((tag, idx) => (
          <span key={idx} className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">{tag}</span>
        ))}
      </div>
      {offer.link && <a href={offer.link} target="_blank" rel="noreferrer" className="text-blue-600 underline">Modell öffnen</a>}
    </div>
  </motion.div>
);

export default function AutoMatchPrototype() {
  const [messages, setMessages] = useState([]);
  const [offers, setOffers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [offersHistory, setOffersHistory] = useState([]);
  const [visuals, setVisuals] = useState([]);
  const [activeSection, setActiveSection] = useState('chat');
  const [inputText, setInputText] = useState(''); // New state for input
  const [isTyping, setIsTyping] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersUpdatedAt, setOffersUpdatedAt] = useState(null);
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [agentLog, setAgentLog] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [uiRecovery, setUiRecovery] = useState({ renderTextOnly: false, degradedMode: false, showBanner: false });
  const [uiState, setUiState] = useState(DEFAULT_UI_FLAGS);
  const [uiHealth, setUiHealth] = useState({});
  const [uiMode, setUiMode] = useState(UI_MODES.NORMAL);
  const [userProfile, setUserProfile] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const offersRef = useRef(null);
  const navRef = useRef(null);
  const rootRef = useRef(null);
  const prevUiSnapshotRef = useRef(null);
  const uiFsmRef = useRef(new UIFiniteStateMachine(UI_MODES.NORMAL));

  const formatAssistantText = (text) => (
    text
      .replace(/\r?\n+/g, ' ')
      .replace(/[*•-]\s+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );

  const normalizeOfferList = (list = []) => list.map((item) => normalizeOfferForUi(item));
  const isFavorite = (offer) => favorites.some((fav) => fav.id === getOfferId(offer));
  const toggleFavorite = (offer) => {
    const normalized = normalizeOfferForUi(offer);
    setFavorites((prev) => {
      const exists = prev.find((f) => f.id === normalized.id);
      if (exists) {
        return prev.filter((f) => f.id !== normalized.id);
      }
      const next = [{ ...normalized, addedAt: new Date().toISOString() }, ...prev];
      return next.slice(0, 50);
    });
  };

  const botSay = (text, delay = 500) => {
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text, ts: new Date().toISOString() }]);
    }, delay);
  };

  // useEffect for initial bot message
  useEffect(() => {
    // Only send if chat is empty, to prevent duplicates during hot reloads or in Strict Mode.
    if (messages.length === 0) { 
      const timer1 = setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: "Erzähl mal, was du so mit deinem Auto vorhast.", ts: new Date().toISOString() }]);
      }, 300);

      // Cleanup timers on unmount or re-run to prevent memory leaks and duplicate messages.
      return () => {
        clearTimeout(timer1);
      };
    }
  }, []); // Empty dependency array ensures this runs only once on initial mount.

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(parsed.map((item) => normalizeOfferForUi(item)));
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore write errors
    }
  }, [favorites]);

  useEffect(() => {
    if (!offers.length) return;
    setFavorites((prev) =>
      prev.map((fav) => {
        const updated = offers.find((o) => o.id === fav.id);
        return updated ? { ...fav, ...updated } : fav;
      }),
    );
  }, [offers]);

  // Initial hot offers load
  useEffect(() => {
    const loadHot = async () => {
      try {
        setOffersLoading(true);
        const res = await fetch('/api/hot-offers');
        if (!res.ok) return;
        const data = await res.json();
      const offersSafe = normalizeOfferList(data.offers || []);
      setOffers(offersSafe);
      if (offersSafe.length > 0) {
        setOffersHistory(prev => [...prev, { at: new Date().toISOString(), offers: offersSafe }]);
      }
      setOffersUpdatedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to load hot offers", err);
    } finally {
      setOffersLoading(false);
      }
    };
    loadHot();
  }, []);

  // useEffect to scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]); // Runs whenever the messages array is updated.

  // Capture client-side console output for admin dumps
  useEffect(() => {
    const levels = ["log", "info", "warn", "error", "debug"];
    const original = {};

    const formatArg = (arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    };

    levels.forEach((lvl) => {
      original[lvl] = console[lvl];
      console[lvl] = (...args) => {
        try {
          setConsoleLogs((prev) => {
            const entry = {
              level: lvl,
              at: new Date().toISOString(),
              message: args.map(formatArg).join(" "),
            };
            const next = [...prev, entry];
            return next.slice(-200); // keep last 200 entries
          });
        } catch {
          // avoid breaking logging
        }
        original[lvl]?.(...args);
      };
    });

    return () => {
      levels.forEach((lvl) => {
        if (original[lvl]) console[lvl] = original[lvl];
      });
    };
  }, []);

  const sendClientEvent = async (eventType, meta = {}) => {
    try {
      await fetch('/api/client-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, eventType, meta }),
      });
    } catch (err) {
      console.warn('client-event failed', err);
    }
  };

  const handleImageError = (offer) => {
    sendClientEvent('IMAGE_LOAD_FAILED', { model: offer?.model || offer?.title, imageUrl: offer?.image_url });
    setUiRecovery((prev) => ({ ...prev, renderTextOnly: true, degradedMode: true, showBanner: true, reason: 'Bild konnte nicht geladen werden' }));
  };

  const collectUiSnapshot = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const visualViewportHeight = window.visualViewport?.height || viewportHeight;
    const viewportScale = window.visualViewport?.scale || 1;
    const navEl = navRef.current;
    const mainRect = rootRef.current?.getBoundingClientRect();
    const inputRect = inputRef.current?.getBoundingClientRect();
    const navRect = navEl?.getBoundingClientRect();
    const chatRect = chatScrollRef.current?.getBoundingClientRect();
    const navVisible = Boolean(
      navRect &&
      navRect.width > 0 &&
      navRect.height > 0 &&
      window.getComputedStyle(navEl || document.body).display !== 'none'
    );
    const inputGuardDisabled = inputRef.current?.dataset?.guardDisabled === 'true';
    const visibility = {
      main: Boolean(mainRect && mainRect.width > 0 && mainRect.height > 0 && window.getComputedStyle(rootRef.current || document.body).visibility !== 'hidden'),
      input: Boolean(inputRect && inputRect.width > 0 && inputRect.height > 0 && window.getComputedStyle(inputRef.current || document.body).visibility !== 'hidden'),
      nav: navVisible,
      chat: Boolean(chatRect && chatRect.width > 0 && chatRect.height > 0 && window.getComputedStyle(chatScrollRef.current || document.body).visibility !== 'hidden'),
    };
    const focusable = {
      input: Boolean(inputRef.current && (!inputRef.current.disabled || inputGuardDisabled) && inputRef.current.tabIndex !== -1),
    };
    const safeAreaInsets = (() => {
      const vv = window.visualViewport;
      if (!vv) return { top: 0, left: 0, right: 0, bottom: 0 };
      const top = Math.max(0, vv.offsetTop || 0);
      const left = Math.max(0, vv.offsetLeft || 0);
      const right = Math.max(0, window.innerWidth - (vv.width + left));
      const bottom = Math.max(0, window.innerHeight - (vv.height + top));
      return { top, left, right, bottom };
    })();
    const touchTargets = navVisible
      ? Array.from(navEl?.querySelectorAll('button') || []).map((btn) => {
          const rect = btn.getBoundingClientRect();
          return { name: btn.innerText || 'nav', width: rect.width, height: rect.height };
        })
      : [];

    return buildSnapshot({
      mainRect,
      inputRect,
      navRect,
      chatRect,
      viewportHeight,
      viewportWidth,
      visualViewportHeight,
      visibility,
      focusable,
      safeAreaInsets,
      viewportScale,
      touchTargets,
      navVisible,
    });
  }, []);

  const runUiHealthCheck = useCallback(() => {
    const snapshot = collectUiSnapshot();
    const { state, snapshot: nextSnapshot } = evaluateUiState(snapshot, prevUiSnapshotRef.current || {});
    prevUiSnapshotRef.current = nextSnapshot;
    setUiState(state);
    const fsm = uiFsmRef.current;
    const next = fsm.next({ serverHealth: uiHealth, localFlags: state });
    if (next.changed) {
      setUiMode(next.next);
      sendClientEvent('UI_FSM_TRANSITION', { previous: next.previous, next: next.next, source: 'local', localFlags: state, serverHealth: uiHealth });
    } else {
      setUiMode(next.next);
    }

    if (state.uiBroken || state.inputNotReachable || state.keyboardOverlayBlocking) {
      setUiRecovery((prev) => ({
        ...prev,
        renderTextOnly: true,
        degradedMode: true,
        showBanner: true,
        reason: state.issues[0] || 'UI-Problem erkannt',
      }));
    }
  }, [collectUiSnapshot]);

  useEffect(() => {
    const handler = () => {
      sendClientEvent('NETWORK_CHANGED', { online: navigator.onLine });
    };
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, [sessionId]);

  useEffect(() => {
    runUiHealthCheck();
    const interval = setInterval(runUiHealthCheck, 1500);
    window.addEventListener('resize', runUiHealthCheck);
    window.addEventListener('scroll', runUiHealthCheck, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', runUiHealthCheck);
      window.removeEventListener('scroll', runUiHealthCheck, true);
    };
  }, [runUiHealthCheck]);

  // Poll agent log
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/session-log?sessionId=${sessionId}&limit=20`);
        if (!res.ok) return;
        const data = await res.json();
        setAgentLog(data.entries || []);
      } catch (err) {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const exportJson = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAdminDump = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/session-dump/${sessionId}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const dump = data.dump || data;
      const dumpWithConsole = { ...dump, clientConsole: consoleLogs };
      exportJson(dumpWithConsole, `admin-dump-${sessionId}.json`);
    } catch (err) {
      console.error('Failed to export admin dump', err);
    }
  };

  const handleSendMessage = async () => {
    const userMessage = inputText.trim();
    if (!userMessage || isTyping) return;

    const userId = Date.now();
    const botId = userId + 1;

    // Prepare history for backend: include prior real messages and current user turn, exclude placeholders
    const historyPayload = [
      ...messages.filter(m => m.text && m.text !== '...'),
      { sender: 'user', text: userMessage },
    ].map(m => ({
      role: m.sender === 'bot' ? 'assistant' : 'user',
      content: m.text,
    }));

    setMessages(prev => [
      ...prev,
      { id: userId, sender: 'user', text: userMessage, ts: new Date().toISOString() },
      { id: botId, sender: 'bot', text: '...', ts: new Date().toISOString() },
    ]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: historyPayload, sessionId }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const replyText = formatAssistantText(data.reply || '');
      const followText = formatAssistantText(data.followUp || '');
      const combined = [replyText, followText].filter(Boolean).join(' ').trim();
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.uiRecovery) setUiRecovery({
        renderTextOnly: Boolean(data.uiRecovery.renderTextOnly),
        degradedMode: Boolean(data.uiRecovery.degradedMode),
        showBanner: Boolean(data.uiRecovery.showBanner),
        reason: data.uiRecovery.reason,
      });
      if (data.ui_health) {
        setUiHealth(data.ui_health);
        const fsm = uiFsmRef.current;
        const next = fsm.next({ serverHealth: data.ui_health, localFlags: uiState });
        if (next.changed) {
          setUiMode(next.next);
          sendClientEvent('UI_FSM_TRANSITION', { previous: next.previous, next: next.next, source: 'server', serverHealth: data.ui_health, localFlags: uiState });
        } else {
          setUiMode(next.next);
        }
        setUiRecovery((prev) => ({
          ...prev,
          renderTextOnly: prev.renderTextOnly || Boolean(data.ui_health.render_text_only),
          degradedMode: prev.degradedMode || Boolean(data.ui_health.degraded_mode),
          showBanner: prev.showBanner || Boolean(data.ui_health.show_banner),
          reason: prev.reason || data.ui_health.reason,
        }));
      }

      setMessages(prev =>
        prev.map(m => m.id === botId
          ? { ...m, text: combined || "Sorry, etwas ist schiefgelaufen." }
          : m)
      );

      const offersSafe = normalizeOfferList(data.content?.offers || []);
      if (offersSafe.length > 0) {
        setOffers(offersSafe);
        setOffersHistory(prev => [...prev, { at: new Date().toISOString(), offers: offersSafe }]);
        setOffersUpdatedAt(new Date().toISOString());
      }
      if (data.content?.user_profile) {
        setUserProfile(data.content.user_profile);
      }
      setVisuals(data.content?.visuals || []);

    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev =>
        prev.map(m => m.id === botId
          ? { ...m, text: "Sorry, etwas ist schiefgelaufen." }
          : m)
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  /*
  Component: SectionLabel
  - Props: id (string), label (string), icon (ReactNode).
  - Mobile behavior: bottom navigation pill, full-width flex with 44px+ touch targets and safe-area padding.
  - Fallback behavior: text-only icon slot; works ohne Emojis/SVG.
  - Accessibility: aria-pressed, focusable button, hoher Kontrast.
  - Breakpoints: sichtbar auf sm (Bottom-Nav), ab md als sekundäre Kontrolle ausgeblendet.
  - Performance: schlanker Button ohne Animationen.
  */
  const SectionLabel = ({ id, label, icon }) => {
    const isActive = activeSection === id;
    return (
      <button
        onClick={() => setActiveSection(id)}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium ${
          isActive ? 'text-blue-600' : 'text-gray-500'
        }`}
        aria-pressed={isActive}
      >
        <span className={`h-12 w-12 rounded-full flex items-center justify-center ${isActive ? 'bg-blue-50' : 'bg-gray-100'}`}>{icon}</span>
        {label}
      </button>
    );
  };

  const uiIssueDetected = uiState.uiBroken || uiState.inputNotReachable || uiState.keyboardOverlayBlocking;
  // Agent darf UI nicht blockieren: keine Hard-Locks, nur Banner.
  const hasCriticalUiIssue = false;
  const isDegradedUi = uiMode === UI_MODES.DEGRADED_VISUALS || uiHealth.degraded_mode || uiIssueDetected;
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const renderTextOnly = uiRecovery.renderTextOnly || Boolean(uiHealth.render_text_only);
  const showUiBanner = uiRecovery.showBanner || Boolean(uiHealth.show_banner) || isDegradedUi || uiIssueDetected;
  const profileBadges = profileToBadges(userProfile);
  const showProfileCard = !isDefaultProfile(userProfile) && (profileBadges.chips.length > 0 || profileBadges.breakers.length > 0);

  const handleUiRecovery = (action) => {
    if (action === 'reload') {
      window.location.reload();
    }
    if (action === 'scroll-to-input') {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.current?.focus();
    }
    if (action === 'reset-zoom') {
      document.body.style.zoom = '1';
      runUiHealthCheck();
    }
    if (action === 'close-keyboard') {
      inputRef.current?.blur();
      runUiHealthCheck();
    }
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-gray-50 font-sans text-sm text-gray-800 flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">F</div>
            <div>
              <div className="text-base font-semibold text-gray-900">diefreundliche.app</div>
              <div className="text-[12px] text-gray-500">Locker-hilfreicher Auto-Buddy</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[12px] text-gray-500">
            <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">Live</span>
            <span className="px-2 py-1 rounded-full bg-gray-100 border text-gray-700">Session: {sessionId.slice(0, 6)}…</span>
            <span className={`px-2 py-1 rounded-full border ${uiMode === UI_MODES.NORMAL ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : uiMode === UI_MODES.DEGRADED_VISUALS ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              UI: {uiMode.toLowerCase()}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 py-4 md:py-6 gap-4 grid md:grid-cols-[1.1fr_0.9fr] lg:grid-cols-[1fr_1fr]">
        {/* Chat & Input */}
        <section className={`${activeSection !== 'chat' ? 'hidden md:flex' : 'flex'} flex-col rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden md:h-[calc(100vh-160px)]`}>
          <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-white">
            <div className="text-sm font-semibold text-gray-900">Chat</div>
            <div className="text-[12px] text-gray-500">Frage stellen, Wünsche teilen, sofort Feedback</div>
          </div>
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                msg={m}
              />
            ))}
            <div ref={messagesEndRef} />
            {messages.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-4">
                Starte eine Unterhaltung. Wir antworten sofort und passen Angebote an.
              </div>
            )}
          </div>
          <div className="border-t bg-white px-4 py-3">
            {/* Input field for user messages */}
            <div className={`flex items-center gap-2 rounded-full border ${uiIssueDetected ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'} px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500`}>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
                placeholder="Erzähl von Alltag, Budget oder Marken – ich höre zu."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                data-guard-disabled="false"
                disabled={false}
                aria-disabled={false}
              />
              <button
                onClick={handleSendMessage}
                className={`h-10 w-10 flex items-center justify-center ${uiIssueDetected ? 'bg-amber-400' : 'bg-blue-600'} text-white rounded-full active:scale-[0.98] transition`}
                aria-label="Nachricht senden"
                disabled={false}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </section>

        {/* Offers, Favorites & Logs */}
        <section className={`${!['offers', 'favorites', 'logs'].includes(activeSection) ? 'hidden md:flex' : 'flex'} flex-col gap-3 md:h-[calc(100vh-160px)] md:overflow-hidden`}>
          <div ref={offersRef} className={`${activeSection !== 'offers' ? 'hidden md:block' : 'block'} rounded-2xl bg-white border border-gray-100 shadow-sm p-4 md:max-h-[calc(100vh-220px)] md:overflow-y-auto`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Live-Angebote</h2>
                <p className="text-[12px] text-gray-500">Optimiert für kleine Screens, scrollfreundlich</p>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                {offersLoading && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">Lädt…</span>}
                {offersUpdatedAt && !offersLoading && (
                  <span className="px-2 py-1 rounded-full bg-gray-100 border text-gray-700">
                    Stand: {new Date(offersUpdatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            {showUiBanner && (
              <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                Bilder oder Assets haken gerade. Ich bleibe bei Textdaten, bis alles stabil ist.{uiRecovery.reason ? ` (${uiRecovery.reason})` : ''}
              </div>
            )}

            {showProfileCard && (
              <div className="mb-3 p-3 rounded-lg border border-blue-100 bg-blue-50/70 text-sm text-blue-900 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-900">Deine Auto-Vibes</span>
                  <span className="text-[11px] text-blue-700">baut sich automatisch</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profileBadges.chips.map((chip, idx) => (
                    <span key={idx} className="px-2 py-1 bg-white border border-blue-100 rounded-full text-[11px] text-blue-900">
                      {chip}
                    </span>
                  ))}
                </div>
                {profileBadges.breakers.length > 0 && (
                  <div className="text-[11px] text-amber-800">
                    Dealbreaker: {profileBadges.breakers.join(" • ")}
                  </div>
                )}
              </div>
            )}

            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AnimatePresence>
                  {offers.map((offer) => (
                    <OfferCard
                      key={offer.id || offer.vin || offer.model}
                      offer={offer}
                      onImageError={handleImageError}
                      renderTextOnly={renderTextOnly}
                      onToggleFavorite={toggleFavorite}
                      isFavorite={isFavorite(offer)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {offers.length === 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 mt-2">
                  Noch keine Angebote – teile deinen Wunsch im Chat, wir füllen die Liste.
                </div>
              )}

              {visuals.length > 0 && !renderTextOnly && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Beispielbilder</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visuals.slice(0, 8).map((url, i) => (
                      <img key={i} src={url} alt={`visual-${i}`} className="w-full h-24 object-cover rounded-lg border" loading="lazy" />
                    ))}
                  </div>
                </div>
              )}
            </>
          </div>

          <div className={`${activeSection !== 'favorites' ? 'hidden md:block' : 'block'} rounded-2xl bg-white border border-gray-100 shadow-sm p-4 md:max-h-[calc(100vh-220px)] md:overflow-y-auto`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Deine Favoriten</h2>
                <p className="text-[12px] text-gray-500">Lokal gespeichert, ohne Login.</p>
              </div>
              <span className="px-2 py-1 rounded-full bg-gray-100 border text-gray-700 text-[12px]">{favorites.length} gespeichert</span>
            </div>
            {favorites.length === 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
                Herz ein Modell, um es hier zu merken.
              </div>
            )}
            {favorites.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {favorites.map((offer) => (
                  <OfferCard
                    key={offer.id || offer.vin || offer.model}
                    offer={offer}
                    onImageError={handleImageError}
                    renderTextOnly={renderTextOnly}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={true}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={`${activeSection !== 'logs' ? 'hidden md:block' : 'block'} rounded-2xl bg-white border border-gray-100 shadow-sm p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-base font-semibold text-gray-900">Agenten-Log</div>
                <div className="text-[12px] text-gray-500">Session {sessionId}</div>
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={handleExportAdminDump} className="px-3 py-1 bg-gray-100 border rounded-lg hover:bg-gray-200 transition text-gray-700">
                  Admin-Dump exportieren
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-600 max-h-52 overflow-y-auto overflow-x-hidden space-y-2">
              {agentLog.length === 0 && <div className="text-gray-400">Noch keine Log-Einträge.</div>}
              {agentLog.map((entry, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-2 w-full">
                  <div className="text-[11px] text-gray-500 flex gap-2">
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    <span className="text-gray-400">Turn: {entry.turnId || "n/a"}</span>
                  </div>
                  <div className="font-medium text-gray-800 mt-1 break-words">User: {entry.user}</div>
                  <div className="text-gray-700 break-words">Bot: {entry.reply}</div>
                  {entry.debugLogs && entry.debugLogs.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {entry.debugLogs.map((log, idx) => (
                        <div key={idx} className="bg-gray-50 border border-gray-100 rounded p-1">
                          <div className="text-[11px] font-semibold text-gray-700">{log.agent}</div>
                          <div className="text-[11px] text-gray-600 break-all max-w-full">
                            in: {JSON.stringify(log.input || {})}
                          </div>
                          <div className="text-[11px] text-gray-600 break-all max-w-full">
                            out: {JSON.stringify(log.output || {})}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <nav ref={navRef} className="md:hidden sticky bottom-0 z-30 bg-white border-t border-gray-100 shadow-inner" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' }}>
        <div className="flex max-w-6xl mx-auto px-1 py-2">
          <SectionLabel id="chat" label="Chat" icon="💬" />
          <SectionLabel id="offers" label="Angebote" icon="🚗" />
          <SectionLabel id="favorites" label="Favoriten" icon="⭐" />
          <SectionLabel id="logs" label="Logs" icon="📒" />
        </div>
      </nav>
    </div>
  );
}
