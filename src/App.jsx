import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';

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

const ChatMessage = ({ msg, onReact, selectedReaction }) => {
  const isBot = msg.sender === 'bot';
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full mb-4 ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div className={`max-w-[85%] p-3 rounded-2xl relative ${
        isBot ? 'bg-white border border-gray-200 text-gray-800' : 'bg-blue-600 text-white'
      }`}>
        <p className="pr-12">{msg.text}</p>
        {isBot && onReact && (
          <div className="absolute top-2 right-2 flex gap-1 text-xs">
            <button
              className={`px-2 py-1 rounded-full border ${selectedReaction === 'up' ? 'bg-green-50 border-green-400 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
              onClick={() => onReact(msg, 'up')}
              aria-label="Daumen hoch"
            >
              👍
            </button>
            <button
              className={`px-2 py-1 rounded-full border ${selectedReaction === 'down' ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
              onClick={() => onReact(msg, 'down')}
              aria-label="Daumen runter"
            >
              👎
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const OfferCard = ({ offer }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-2"
  >
    <div className="h-28 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-600 overflow-hidden">
      {offer.image_url ? (
        <img
          src={offer.image_url}
          alt={offer.title || "Fahrzeug"}
          className="object-cover h-full w-full rounded"
        />
      ) : (
        <div className="h-full w-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
          Bild nicht verfügbar
        </div>
      )}
    </div>
    <div className="flex justify-between items-center">
      <h3 className="font-bold text-sm line-clamp-1">{offer.title || offer.model}</h3>
      <span className="text-blue-600 font-bold text-xs bg-blue-50 px-2 py-1 rounded">
        {offer.price ? `${Number(offer.price).toLocaleString("de-DE")} €` : "-"}
      </span>
    </div>
    <div className="text-xs text-gray-600 line-clamp-2">
      {offer.dealer} {offer.location ? `• ${offer.location}` : ""}
    </div>
    {offer.mileage && (
      <div className="text-[11px] text-gray-500">Kilometerstand: {offer.mileage}</div>
    )}
    {offer.badge && <div className="text-[11px] text-blue-700 bg-blue-50 px-2 py-1 rounded w-fit">{offer.badge}</div>}
    {offer.link && <a href={offer.link} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline">Zum Angebot</a>}
  </motion.div>
);

export default function AutoMatchPrototype() {
  const [messages, setMessages] = useState([]);
  const [offers, setOffers] = useState([]);
  const [visuals, setVisuals] = useState([]);
  const [definition, setDefinition] = useState('');
  const [inputText, setInputText] = useState(''); // New state for input
  const [isTyping, setIsTyping] = useState(false);
  const [reactions, setReactions] = useState({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersUpdatedAt, setOffersUpdatedAt] = useState(null);
  const messagesEndRef = useRef(null);

  const formatAssistantText = (text) => (
    text
      .replace(/\r?\n+/g, ' ')
      .replace(/[*•-]\s+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );

  const botSay = (text, delay = 500) => {
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text }]);
    }, delay);
  };

  // useEffect for initial bot message
  useEffect(() => {
    // Only send if chat is empty, to prevent duplicates during hot reloads or in Strict Mode.
    if (messages.length === 0) { 
      const timer1 = setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: "Na, brauchst du ein neues Auto?" }]);
      }, 300);

      // Cleanup timers on unmount or re-run to prevent memory leaks and duplicate messages.
      return () => {
        clearTimeout(timer1);
      };
    }
  }, []); // Empty dependency array ensures this runs only once on initial mount.

  // Initial hot offers load
  useEffect(() => {
    const loadHot = async () => {
      try {
        setOffersLoading(true);
        const res = await fetch('/api/hot-offers');
        if (!res.ok) return;
        const data = await res.json();
        const offersSafe = data.offers || [];
        setOffers(offersSafe);
        setDefinition("");
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
      { id: userId, sender: 'user', text: userMessage },
      { id: botId, sender: 'bot', text: '...' },
    ]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: historyPayload }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const replyText = formatAssistantText(data.reply || '');
      const followText = formatAssistantText(data.followUp || '');
      const combined = [replyText, followText].filter(Boolean).join(' ').trim();

      setMessages(prev =>
        prev.map(m => m.id === botId
          ? { ...m, text: combined || "Sorry, etwas ist schiefgelaufen." }
          : m)
      );

      const offersSafe = data.content?.offers || [];
      if (offersSafe.length > 0) {
        setOffers(offersSafe);
        setOffersUpdatedAt(new Date().toISOString());
      }
      setVisuals(data.content?.visuals || []);
      setDefinition(data.content?.definition || '');

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

  const handleReaction = async (msg, reaction) => {
    setReactions(prev => ({ ...prev, [msg.id]: reaction }));
    try {
      const historyPayload = messages
        .filter(m => m.text && m.text !== '...')
        .map(m => ({
          role: m.sender === 'bot' ? 'assistant' : 'user',
          content: m.text,
        }));

      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          reaction,
          messageText: msg.text,
          contentSnapshot: { offers, visuals, definition },
          history: historyPayload,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to send feedback', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm overflow-hidden">
      <div className="w-1/3 min-w-[300px] flex flex-col border-r bg-white">
        <div className="p-4 border-b font-bold bg-blue-600 text-white">AutoMatch AI</div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              msg={m}
              onReact={m.sender === 'bot' ? handleReaction : undefined}
              selectedReaction={reactions[m.id]}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 border-t bg-white">
          {/* Input field for user messages */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 p-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Deine Nachricht..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 text-white p-2 rounded-full"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 bg-gray-100 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-700">Live-Angebote & Bilder</h2>
        <div className="text-xs text-gray-500 mb-3 flex gap-3 items-center">
          {offersLoading && <span>Lädt Angebote…</span>}
          {offersUpdatedAt && !offersLoading && <span>Stand: {new Date(offersUpdatedAt).toLocaleTimeString()}</span>}
        </div>
        {definition && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 mb-4">
            {definition}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {offers.map((offer, idx) => <OfferCard key={idx} offer={offer} />)}
          </AnimatePresence>
        </div>
        {visuals.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Beispielbilder</h3>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {visuals.slice(0, 8).map((url, i) => (
                <img key={i} src={url} alt={`visual-${i}`} className="w-full h-24 object-cover rounded-lg border" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
