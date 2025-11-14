import { Linkedin, Instagram, Send, Music } from 'lucide-react';
import SocialCard from './components/SocialCard';

function App() {
  const socialLinks = [
    {
      name: 'LinkedIn',
      icon: Linkedin,
      url: 'https://linkedin.com/company/actdevcommunity',
      color: 'from-blue-600 to-blue-700',
      hoverColor: 'hover:shadow-blue-500/50'
    },
    {
      name: 'Instagram',
      icon: Instagram,
      url: 'https://instagram.com/act_dev_community',
      color: 'from-pink-600 to-purple-600',
      hoverColor: 'hover:shadow-pink-500/50'
    },
    {
      name: 'Telegram',
      icon: Send,
      url: 'https://t.me/actdevcomunity',
      color: 'from-sky-500 to-blue-600',
      hoverColor: 'hover:shadow-sky-500/50'
    },
    {
      name: 'TikTok',
      icon: Music,
      url: 'https://tiktok.com/@act_dev_community?lang=en',
      color: 'from-gray-800 to-gray-900',
      hoverColor: 'hover:shadow-gray-700/50'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-12 animate-fadeIn">
          <div className="inline-block mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
            <div className="relative bg-white/10 backdrop-blur-sm rounded-full p-6 border border-white/20">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
                <img
  src="/logo.png"
  alt="Act Dev Community Logo"
  className="h-20 w-20 object-contain"
/>
              </div>
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-3 tracking-tight">
            Act Dev Community
          </h1>
          <p className="text-slate-400 text-lg md:text-xl">Act Dev Community a space where developers learn, build, and grow together.</p>
          <p className="text-slate-400 text-lg md:text-xl">Connect with us on social media</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {socialLinks.map((social, index) => (
            <SocialCard key={social.name} social={social} index={index} />
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-slate-500 text-sm">© 2025 Act Dev Community. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
