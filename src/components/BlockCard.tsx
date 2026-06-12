import React from 'react';
import { MapPin, Star, Calendar, User, ChevronRight, Info } from 'lucide-react';
import { Block, BlockStatus } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface BlockCardProps {
  block: Block;
  onClick: () => void;
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  new: 'bg-blue-500',
  clean: 'bg-emerald-500',
  to_clean: 'bg-amber-500',
  project: 'bg-purple-500',
};

const STATUS_LABELS: Record<BlockStatus, string> = {
  new: 'Nuovo',
  clean: 'Pulito',
  to_clean: 'Da Pulire',
  project: 'Progetto',
};

export const BlockCard: React.FC<BlockCardProps> = ({ block, onClick }) => {
  const date = block.createdAt?.toDate ? block.createdAt.toDate() : new Date(block.createdAt);

  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="relative h-36 bg-stone-50 flex items-center justify-center border-b border-stone-100">
        {block.photos?.[0] ? (
          <img
            src={block.photos[0]}
            alt={block.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400">
            <MapPin className="w-10 h-10" />
          </div>
        )}
        <div className={cn(
          "absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[8px] font-black text-white uppercase tracking-wider",
          STATUS_COLORS[block.status]
        )}>
          {STATUS_LABELS[block.status]}
        </div>
        {block.favorite && (
          <div className="absolute top-2.5 right-2.5 p-1 bg-white/90 backdrop-blur-sm rounded-full text-amber-500 shadow-xs border border-stone-150">
            <Star className="w-3.5 h-3.5 fill-current" />
          </div>
        )}
      </div>

      <div className="p-3 text-left flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1.5 mb-0.5">
            <h3 className="text-sm font-extrabold text-stone-850 leading-tight">{block.name}</h3>
          </div>
          <div className="flex items-center gap-1 text-stone-400 text-xs mb-2">
            <MapPin className="w-2.5 h-2.5" />
            <span className="truncate">{block.area}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold text-stone-400 uppercase tracking-wider">
              <Calendar className="w-2.5 h-2.5" />
              {format(date, 'd MMM yy', { locale: it })}
            </div>
            <div className="flex items-center gap-1 text-[9px] font-extrabold text-amber-600 uppercase tracking-wider bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
              <User className="w-2.5 h-2.5" />
              <span className="truncate max-w-[65px]">
                {block.projectOwner || block.createdByDisplayName || block.createdByEmail?.split('@')[0] || 'Anon'}
              </span>
            </div>
            {block.lines && block.lines.length > 0 && (
              <div className="flex items-center gap-1 text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                <Info className="w-2.5 h-2.5" />
                {block.lines.length} Linee
              </div>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
        </div>
      </div>
    </button>
  );
};
