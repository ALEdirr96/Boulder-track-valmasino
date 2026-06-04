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
      className="w-full flex flex-col bg-white border border-stone-100 rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="relative h-32 bg-stone-100">
        {block.photos?.[0] ? (
          <img
            src={block.photos[0]}
            alt={block.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <MapPin className="w-12 h-12" />
          </div>
        )}
        <div className={cn(
          "absolute top-3 left-3 px-2 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider",
          STATUS_COLORS[block.status]
        )}>
          {STATUS_LABELS[block.status]}
        </div>
        {block.favorite && (
          <div className="absolute top-3 right-3 p-1.5 bg-white/80 backdrop-blur-sm rounded-full text-amber-500">
            <Star className="w-4 h-4 fill-current" />
          </div>
        )}
      </div>

      <div className="p-4 text-left flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-lg font-bold text-stone-800 leading-tight">{block.name}</h3>
          </div>
          <div className="flex items-center gap-1 text-stone-400 text-sm mb-3">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{block.area}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-stone-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] font-medium text-stone-400 uppercase tracking-wider">
              <Calendar className="w-3 h-3" />
              {format(date, 'd MMM yy', { locale: it })}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
              <User className="w-2.5 h-2.5" />
              <span className="truncate max-w-[80px]">
                {block.projectOwner || block.createdByDisplayName || block.createdByEmail?.split('@')[0] || 'Anon'}
              </span>
            </div>
            {block.lines && block.lines.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-wider">
                <Info className="w-3 h-3" />
                {block.lines.length} Linee
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-stone-300" />
        </div>
      </div>
    </button>
  );
};
