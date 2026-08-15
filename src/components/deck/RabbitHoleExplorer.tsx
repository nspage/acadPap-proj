import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronRight, ChevronLeft, Library, Search, Layers, Compass } from 'lucide-react';
import { 
  fetchDomains, 
  fetchFieldsForDomain, 
  fetchTopicsForSubfield,
  OpenAlexDomain,
  OpenAlexField,
  OpenAlexSubfield,
  OpenAlexTopic
} from '../../services/openalex-taxonomy';

interface RabbitHoleExplorerProps {
  onSelectTopic: (topicId: string, topicName: string) => void;
  onClose: () => void;
}

type Step = 'domains' | 'fields' | 'subfields' | 'topics';

export function RabbitHoleExplorer({ onSelectTopic, onClose }: RabbitHoleExplorerProps) {
  const [step, setStep] = useState<Step>('domains');
  const [loading, setLoading] = useState<boolean>(true);
  const [direction, setDirection] = useState<number>(1); // 1 for forward, -1 for backward

  // Data states
  const [domains, setDomains] = useState<OpenAlexDomain[]>([]);
  const [fields, setFields] = useState<OpenAlexField[]>([]);
  const [subfields, setSubfields] = useState<OpenAlexSubfield[]>([]);
  const [topics, setTopics] = useState<OpenAlexTopic[]>([]);

  // Selection states
  const [selectedDomain, setSelectedDomain] = useState<OpenAlexDomain | null>(null);
  const [selectedField, setSelectedField] = useState<OpenAlexField | null>(null);
  const [selectedSubfield, setSelectedSubfield] = useState<OpenAlexSubfield | null>(null);

  useEffect(() => {
    let active = true;
    fetchDomains().then((res) => {
      if (active) {
        setDomains(res);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const handleDomainClick = async (domain: OpenAlexDomain) => {
    setDirection(1);
    setSelectedDomain(domain);
    setStep('fields');
    setLoading(true);
    const f = await fetchFieldsForDomain(domain.id);
    setFields(f);
    setLoading(false);
  };

  const handleFieldClick = (field: OpenAlexField) => {
    setDirection(1);
    setSelectedField(field);
    setSubfields(field.subfields || []);
    setStep('subfields');
  };

  const handleSubfieldClick = async (subfield: OpenAlexSubfield) => {
    setDirection(1);
    setSelectedSubfield(subfield);
    setStep('topics');
    setLoading(true);
    const t = await fetchTopicsForSubfield(subfield.id);
    setTopics(t);
    setLoading(false);
  };

  const handleTopicClick = (topic: OpenAlexTopic) => {
    const shortId = topic.id.split('/').pop() || '';
    onSelectTopic(shortId, topic.display_name);
  };

  const goBack = () => {
    setDirection(-1);
    if (step === 'fields') setStep('domains');
    if (step === 'subfields') setStep('fields');
    if (step === 'topics') setStep('subfields');
  };

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -100 : 100,
      opacity: 0
    })
  };

  const renderHeader = () => {
    let title = 'Explore Domains';
    if (step === 'fields') title = selectedDomain?.display_name || '';
    if (step === 'subfields') title = selectedField?.display_name || '';
    if (step === 'topics') title = selectedSubfield?.display_name || '';

    return (
      <div className="flex items-center p-4 border-b border-slate-800 bg-slate-900/50">
        {step !== 'domains' ? (
          <button onClick={goBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <Compass className="w-5 h-5 ml-2 text-indigo-400" />
        )}
        <h3 className="ml-3 font-semibold text-white truncate flex-1">{title}</h3>
        <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-indigo-400 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-mono text-slate-400">Charting the rabbit hole...</span>
        </div>
      );
    }

    let items: any[] = [];
    let onSelect: (item: any) => void = () => {};
    let icon = <Layers className="w-4 h-4" />;

    if (step === 'domains') {
      items = domains;
      onSelect = handleDomainClick;
      icon = <Library className="w-4 h-4 text-indigo-400" />;
    } else if (step === 'fields') {
      items = fields;
      onSelect = handleFieldClick;
    } else if (step === 'subfields') {
      items = subfields;
      onSelect = handleSubfieldClick;
    } else if (step === 'topics') {
      items = topics;
      onSelect = handleTopicClick;
      icon = <Search className="w-4 h-4 text-emerald-400" />;
    }

    return (
      <div className="overflow-y-auto max-h-[60vh] p-2 space-y-1 custom-scrollbar">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-slate-800 text-left transition-colors group"
          >
            <div className="flex items-start space-x-3 pr-4">
              <div className="mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                {icon}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors leading-tight">
                  {item.display_name}
                </span>
                {item.works_count && (
                  <span className="text-xs text-slate-500 mt-1 font-mono">
                    {item.works_count.toLocaleString()} papers
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {renderHeader()}
        
        <div className="relative overflow-hidden bg-slate-950/30">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full"
            >
              {renderList()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
