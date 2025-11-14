import { LucideIcon } from 'lucide-react';

interface SocialCardProps {
  social: {
    name: string;
    icon: LucideIcon;
    url: string;
    color: string;
    hoverColor: string;
  };
  index: number;
}

function SocialCard({ social, index }: SocialCardProps) {
  const Icon = social.icon;

  return (
    <a
      href={social.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10
        transition-all duration-300 hover:scale-105 hover:bg-white/10 ${social.hoverColor} hover:shadow-2xl
        animate-slideUp`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center space-x-4">
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${social.color} flex items-center justify-center
          transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 shadow-lg`}>
          <Icon className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-white group-hover:text-white/90 transition-colors">
            {social.name}
          </h3>
          <p className="text-slate-400 text-sm">Follow us</p>
        </div>
        <svg
          className="w-6 h-6 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all duration-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  );
}

export default SocialCard;