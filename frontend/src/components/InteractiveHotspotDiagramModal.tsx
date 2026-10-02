import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  ShoppingCart,
  Plus,
  Minus,
  Printer,
  Download,
  Target,
  Eye,
  Edit3,
} from 'lucide-react';

interface CartItem {
  partNo: string;
  description: string;
  refNo: string;
  figNo: string;
  figName: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

interface HotspotPin {
  refNo: string;
  xPct: number; // 0 to 100 percentage of image width
  yPct: number; // 0 to 100 percentage of image height
}

interface InteractiveHotspotDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  figNo?: string;
  figName?: string;
  figure?: { fig_no: string; fig_name: string; imageUrl?: string };
  modelCode: string;
  parts?: any[];
  rows?: any[];
}

export const InteractiveHotspotDiagramModal: React.FC<InteractiveHotspotDiagramModalProps> = ({
  isOpen,
  onClose,
  imageUrl = '',
  figNo = '',
  figName = '',
  figure,
  modelCode,
  parts,
  rows,
}) => {
  const effectiveImageUrl = imageUrl || figure?.imageUrl || '';
  const effectiveFigNo = figNo || figure?.fig_no || '1';
  const effectiveFigName = figName || figure?.fig_name || 'PARTS';
  const effectiveParts = parts || rows || [];
  const [zoom, setZoom] = useState<number>(1);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [selectedPartForPin, setSelectedPartForPin] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Filter parts strictly belonging to this figure
  const figureParts = useMemo(() => {
    return effectiveParts.filter((p) => {
      const pFigNo = String(p.fig_no || p.parent_fig_no || '').trim();
      const pFigName = String(p.fig_name || p.parent_fig_name || '').trim().toUpperCase();
      return (
        (effectiveFigNo && pFigNo === String(effectiveFigNo).trim()) ||
        (effectiveFigName && pFigName === String(effectiveFigName).trim().toUpperCase())
      );
    });
  }, [effectiveParts, effectiveFigNo, effectiveFigName]);

  // Initial / Stored Hotspot Pins (stored per figure in localStorage)
  const storageKey = `hotspots_${modelCode}_${effectiveFigNo}_${effectiveFigName}`;
  const [pins, setPins] = useState<Record<string, HotspotPin>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    // Generate intelligent default spread positions around center if none saved
    const initial: Record<string, HotspotPin> = {};
    figureParts.forEach((p, idx) => {
      const ref = String(p.ref_no || idx + 1).trim();
      if (!ref || ref === '-' || ref === '0') return;
      const angle = (idx / Math.max(1, figureParts.length)) * Math.PI * 2;
      const radius = 28 + (idx % 3) * 8; // percentage radius
      const x = Math.max(15, Math.min(85, 50 + Math.cos(angle) * radius));
      const y = Math.max(15, Math.min(85, 50 + Math.sin(angle) * radius));
      initial[ref] = { refNo: ref, xPct: Number(x.toFixed(1)), yPct: Number(y.toFixed(1)) };
    });
    return initial;
  });

  const savePins = (newPins: Record<string, HotspotPin>) => {
    setPins(newPins);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newPins));
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  // Handle clicking on image in edit mode to place/move pin
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'edit' || !selectedPartForPin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const updated = {
      ...pins,
      [selectedPartForPin]: {
        refNo: selectedPartForPin,
        xPct: Number(x.toFixed(1)),
        yPct: Number(y.toFixed(1)),
      },
    };
    savePins(updated);
  };

  // Add item to ERP Cart
  const addToCart = (part: any) => {
    const partNo = String(part.part_no || '').trim();
    const refNo = String(part.ref_no || '').trim();
    const price = Number(part.mrp) || Number(part.dealer_price) || 120.0;
    const gst = Number(part.gst_rate) || 28;

    setCart((prev) => {
      const existing = prev.find((item) => item.partNo === partNo);
      if (existing) {
        return prev.map((item) =>
          item.partNo === partNo ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          partNo,
          description: part.description || 'GENUINE SPARE PART',
          refNo,
          figNo,
          figName,
          qty: 1,
          unitPrice: price,
          gstRate: gst,
        },
      ];
    });
  };

  const updateCartQty = (partNo: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.partNo === partNo ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const cartTotalQty = cart.reduce((acc, it) => acc + it.qty, 0);
  const cartSubtotal = cart.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
  const cartGstTotal = cart.reduce(
    (acc, it) => acc + (it.qty * it.unitPrice * (it.gstRate / 100)),
    0
  );
  const cartGrandTotal = cartSubtotal + cartGstTotal;

  const downloadQuotationCsv = () => {
    if (cart.length === 0) return;
    const headers = ['Ref No', 'Part No', 'Description', 'Figure', 'Qty', 'Unit MRP', 'GST %', 'Total Amount'];
    const csvRows = [headers.join(',')];

    cart.forEach((it) => {
      const rowTotal = it.qty * it.unitPrice * (1 + it.gstRate / 100);
      csvRows.push(
        [
          `"${it.refNo}"`,
          `"${it.partNo}"`,
          `"${it.description}"`,
          `"FIG. ${it.figNo} - ${it.figName}"`,
          it.qty,
          it.unitPrice.toFixed(2),
          `${it.gstRate}%`,
          rowTotal.toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SimplifyERP_Order_Quotation_${modelCode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-7xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[94vh]"
      >
        {/* Top Header & Toolbar */}
        <div className="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/90 dark:bg-zinc-900/90 gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                  {effectiveFigNo ? `FIG. ${effectiveFigNo} - ` : ''}{effectiveFigName || 'PARTS DIAGRAM'}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {modelCode}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                1000×1200 HD Interactive Exploded Diagram with Hotspots &amp; Order Mapping
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View vs Pin Editor Toggle */}
            <div className="flex p-0.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMode('view')}
                className={`py-1 px-2.5 rounded-md transition-all flex items-center gap-1.5 ${
                  mode === 'view'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-600 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Browse &amp; Order
              </button>
              <button
                type="button"
                onClick={() => setMode('edit')}
                className={`py-1 px-2.5 rounded-md transition-all flex items-center gap-1.5 ${
                  mode === 'edit'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Pin Editor
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono font-bold text-zinc-700 dark:text-zinc-200 min-w-[45px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                className="p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="px-2 py-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 rounded ml-0.5"
              >
                100%
              </button>
            </div>

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="relative inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Order Cart</span>
              <span className="bg-white text-emerald-800 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {cartTotalQty}
              </span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Workspace (Split Diagram & Parts Table) */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Left Side: 1000x1200 Diagram Viewport */}
          <div className="flex-1 bg-zinc-950 overflow-auto flex items-center justify-center p-3 relative select-none">
            {mode === 'edit' && (
              <div className="absolute top-3 left-3 z-20 bg-blue-600/90 text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-xs flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  {selectedPartForPin
                    ? `Click diagram to place Ref #${selectedPartForPin}`
                    : 'Select a part from right list, then click on diagram to place pin'}
                </span>
              </div>
            )}

            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                cursor: mode === 'edit' ? 'crosshair' : 'default',
              }}
              className="relative max-w-full max-h-[82vh] aspect-[1000/1200] inline-block shadow-2xl rounded-sm overflow-hidden"
            >
              {/* The 1000x1200 Clean Image */}
              <img
                src={effectiveImageUrl || imageUrl}
                alt={effectiveFigName || figName}
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* Hotspot Pins Overlay */}
              {Object.values(pins).map((pin) => {
                const partInfo = figureParts.find(
                  (p) => String(p.ref_no).trim() === pin.refNo
                );
                const isActive = activeRef === pin.refNo;

                return (
                  <div
                    key={pin.refNo}
                    style={{
                      left: `${pin.xPct}%`,
                      top: `${pin.yPct}%`,
                    }}
                    onMouseEnter={() => setActiveRef(pin.refNo)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRef(pin.refNo);
                      if (mode === 'edit') setSelectedPartForPin(pin.refNo);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-all cursor-pointer group ${
                      isActive ? 'scale-125 z-30' : 'hover:scale-115'
                    }`}
                  >
                    {/* Badge Pill */}
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-mono font-black text-[11px] sm:text-xs shadow-md border-2 transition-all ${
                        isActive
                          ? 'bg-emerald-500 border-white text-white ring-4 ring-emerald-500/40 animate-pulse'
                          : 'bg-blue-600/90 hover:bg-blue-600 border-white text-white'
                      }`}
                    >
                      {pin.refNo}
                    </div>

                    {/* Hover Floating Tooltip Card */}
                    {isActive && partInfo && mode === 'view' && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-xl bg-zinc-900 text-white shadow-2xl border border-zinc-700 text-left pointer-events-auto z-40 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mb-1.5">
                          <span className="font-mono font-bold text-[10px] text-emerald-400">
                            REF #{partInfo.ref_no}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            QTY: {partInfo.QTY || partInfo[modelCode] || 1}
                          </span>
                        </div>
                        <p className="font-mono font-extrabold text-xs text-white leading-tight">
                          {partInfo.part_no}
                        </p>
                        <p className="text-[11px] text-zinc-300 font-medium truncate mt-0.5">
                          {partInfo.description}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800">
                          <span className="font-mono font-bold text-xs text-emerald-400">
                            ₹{partInfo.mrp || 120}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(partInfo);
                            }}
                            className="inline-flex items-center gap-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add to Cart
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side: Parts Table for this Figure */}
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col h-72 lg:h-full">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Figure Parts ({figureParts.length})
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Click row to locate</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {figureParts.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  No parts mapped to this figure index.
                </div>
              ) : (
                figureParts.map((part, idx) => {
                  const ref = String(part.ref_no || idx + 1).trim();
                  const isSelected = activeRef === ref;
                  const hasPin = Boolean(pins[ref]);

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setActiveRef(ref);
                        if (mode === 'edit') setSelectedPartForPin(ref);
                      }}
                      className={`p-3 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-600'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 mt-0.5 ${
                            hasPin
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {ref}
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-zinc-900 dark:text-white truncate">
                            {part.part_no}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">{part.description}</p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                            <span>Qty: {part.QTY || part[modelCode] || 1}</span>
                            <span>•</span>
                            <span className="text-emerald-600 font-bold">₹{part.mrp || 120}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(part);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-100 hover:bg-emerald-600 text-zinc-600 hover:text-white dark:bg-zinc-800 dark:text-zinc-300 transition-colors shrink-0"
                        title="Add to Order Cart"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Slide-out Order Cart Drawer */}
          {isCartOpen && (
            <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-white">
                    Order Quotation ({cartTotalQty} items)
                  </h4>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">
                    Your cart is currently empty. Click on parts or diagram hotspots to add items.
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.partNo} className="pt-3 first:pt-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-xs text-zinc-900 dark:text-white truncate">
                            {item.partNo}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
                          <p className="text-[10px] font-mono text-zinc-400">Ref #{item.refNo}</p>
                        </div>
                        <span className="font-mono font-bold text-xs text-emerald-600">
                          ₹{(item.qty * item.unitPrice).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-zinc-400 font-mono">
                          @ ₹{item.unitPrice.toFixed(2)} (+{item.gstRate}% GST)
                        </span>

                        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                          <button
                            onClick={() => updateCartQty(item.partNo, -1)}
                            className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center font-mono font-bold text-xs">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateCartQty(item.partNo, 1)}
                            className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-3">
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-zinc-500">
                      <span>Subtotal:</span>
                      <span>₹{cartSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>GST (Avg 28%):</span>
                      <span>₹{cartGstTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-white pt-1 border-t border-zinc-200 dark:border-zinc-700">
                      <span>Grand Total:</span>
                      <span className="text-emerald-600">₹{cartGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={downloadQuotationCsv}
                      className="py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
