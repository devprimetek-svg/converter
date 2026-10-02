import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Barcode,
  PackageCheck,
  Download,
  Search,
} from 'lucide-react';
import { generateCode128Svg, generateQrCodeSvg } from '../utils/barcodeGenerator';

interface WarehouseBarcodeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  modelCode: string;
  catalogName?: string;
  onUpdateRowLocation?: (partNo: string, newLocation: string) => void;
}

type LabelTemplate = 'thermal-50x30' | 'thermal-50x25' | 'a4-24' | 'a4-65';

export const WarehouseBarcodeStudioModal: React.FC<WarehouseBarcodeStudioModalProps> = ({
  isOpen,
  onClose,
  rows,
  modelCode,
  catalogName = 'Warehouse Catalog',
}) => {
  const [activeTab, setActiveTab] = useState<'labels' | 'picklist' | 'racks'>('labels');
  const [template, setTemplate] = useState<LabelTemplate>('thermal-50x30');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedParts, setSelectedParts] = useState<Set<string>>(() => {
    return new Set(rows.map((r) => String(r.part_no || '')).filter(Boolean));
  });

  // Picklist check states
  const [pickedState, setPickedState] = useState<Record<string, boolean>>({});

  // Filtered parts
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const pn = String(r.part_no || '').toLowerCase();
      const desc = String(r.description || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      return !q || pn.includes(q) || desc.includes(q);
    });
  }, [rows, searchQuery]);

  // Picklist sorted by location: Aisle -> Rack -> Bin
  const sortedPicklist = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const locA = String(a.rack_bin || 'Z99').toUpperCase();
      const locB = String(b.rack_bin || 'Z99').toUpperCase();
      return locA.localeCompare(locB);
    });
  }, [filteredRows]);

  const toggleSelectAll = () => {
    if (selectedParts.size === filteredRows.length) {
      setSelectedParts(new Set());
    } else {
      setSelectedParts(new Set(filteredRows.map((r) => String(r.part_no || '')).filter(Boolean)));
    }
  };

  const togglePartSelection = (partNo: string) => {
    const updated = new Set(selectedParts);
    if (updated.has(partNo)) updated.delete(partNo);
    else updated.add(partNo);
    setSelectedParts(updated);
  };

  const togglePicked = (partNo: string) => {
    setPickedState((prev) => ({ ...prev, [partNo]: !prev[partNo] }));
  };

  const pickedCount = Object.values(pickedState).filter(Boolean).length;

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const downloadPicklistCsv = () => {
    const headers = ['Picked', 'Rack/Bin Location', 'Part No', 'Description', 'Figure', 'Required Qty', 'MRP'];
    const csvRows = [headers.join(',')];

    sortedPicklist.forEach((r) => {
      const isPicked = pickedState[r.part_no] ? 'YES' : 'NO';
      const loc = r.rack_bin || 'UNASSIGNED';
      csvRows.push(
        [
          isPicked,
          `"${loc}"`,
          `"${r.part_no}"`,
          `"${r.description}"`,
          `"FIG. ${r.fig_no || ''} - ${r.fig_name || ''}"`,
          r.QTY || r[modelCode] || 1,
          r.mrp || 120,
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SimplifyERP_Warehouse_Picklist_${modelCode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[94vh]"
      >
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Warehouse &amp; Barcode Label Studio
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  {modelCode}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {catalogName} • Print Code128 &amp; QR labels and execute walking-optimized godown picking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print ({activeTab === 'labels' ? selectedParts.size : sortedPicklist.length})
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-5 bg-white dark:bg-zinc-900 text-xs font-semibold print:hidden">
          <button
            onClick={() => setActiveTab('labels')}
            className={`py-3 px-3 border-b-2 font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'labels'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            Barcode &amp; QR Labels
          </button>
          <button
            onClick={() => setActiveTab('picklist')}
            className={`py-3 px-3 border-b-2 font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'picklist'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            Optimized Pick-List ({pickedCount}/{sortedPicklist.length})
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'labels' && (
            <div className="space-y-4">
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs print:hidden">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">Format:</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setTemplate('thermal-50x30')}
                      className={`px-2.5 py-1 rounded-lg border font-bold ${
                        template === 'thermal-50x30'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      Thermal (50×30 mm)
                    </button>
                    <button
                      onClick={() => setTemplate('thermal-50x25')}
                      className={`px-2.5 py-1 rounded-lg border font-bold ${
                        template === 'thermal-50x25'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      Compact (50×25 mm)
                    </button>
                    <button
                      onClick={() => setTemplate('a4-24')}
                      className={`px-2.5 py-1 rounded-lg border font-bold ${
                        template === 'a4-24'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      A4 Sheet (24-Up)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <div className="relative w-44">
                    <input
                      type="text"
                      placeholder="Search parts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                    />
                    <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-400" />
                  </div>
                  <button
                    onClick={toggleSelectAll}
                    className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {selectedParts.size === filteredRows.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Printable Labels Grid */}
              <div
                className={`grid gap-3 ${
                  template === 'a4-24'
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                }`}
              >
                {filteredRows.map((part, idx) => {
                  const partNo = String(part.part_no || '').trim();
                  if (!partNo) return null;
                  const isChecked = selectedParts.has(partNo);
                  const location = part.rack_bin || `RACK-${String.fromCharCode(65 + (idx % 6))}-${(idx % 12) + 1}`;
                  const mrp = part.mrp || 145.0;

                  return (
                    <div
                      key={idx}
                      onClick={() => togglePartSelection(partNo)}
                      className={`relative p-3 rounded-xl border transition-all cursor-pointer bg-white text-zinc-900 shadow-xs flex flex-col justify-between select-none ${
                        isChecked
                          ? 'border-purple-600 ring-2 ring-purple-500/20'
                          : 'opacity-40 border-zinc-200'
                      }`}
                      style={{
                        minHeight: template === 'thermal-50x25' ? '120px' : '145px',
                      }}
                    >
                      {/* Checkbox indicator in top right */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="absolute top-2 right-2 rounded text-purple-600 pointer-events-none print:hidden"
                      />

                      {/* Header */}
                      <div className="border-b border-zinc-200 pb-1 mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-800">
                          YAMAHA • GENUINE
                        </span>
                        <span className="text-[9px] font-mono font-bold text-zinc-600">
                          {modelCode}
                        </span>
                      </div>

                      {/* Body */}
                      <div className="space-y-1">
                        <p className="font-mono font-black text-sm text-black tracking-wider leading-none">
                          {partNo}
                        </p>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase truncate">
                          {part.description || 'GENUINE SPARE PART'}
                        </p>
                      </div>

                      {/* Barcode & QR SVG */}
                      <div className="my-1.5 flex items-center justify-between gap-2">
                        <div
                          className="flex-1 overflow-hidden"
                          dangerouslySetInnerHTML={{
                            __html: generateCode128Svg(partNo, 170, 36, '#000000'),
                          }}
                        />
                        <div
                          className="w-10 h-10 shrink-0"
                          dangerouslySetInnerHTML={{
                            __html: generateQrCodeSvg(partNo, 40, '#000000'),
                          }}
                        />
                      </div>

                      {/* Footer: Price & Warehouse Location */}
                      <div className="pt-1 border-t border-zinc-200 flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold text-black">
                          MRP: ₹{Number(mrp).toFixed(2)}
                        </span>
                        <span className="font-black bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded border border-zinc-300">
                          {location}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'picklist' && (
            <div className="space-y-4">
              {/* Picklist Progress Banner */}
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-purple-600" />
                    <h4 className="font-bold text-sm text-purple-900 dark:text-purple-200">
                      Warehouse Route-Optimized Picklist
                    </h4>
                  </div>
                  <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">
                    Arranged sequentially by Rack ➔ Shelf ➔ Bin for zero walking backtrack.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-black font-mono text-purple-900 dark:text-purple-100">
                      {pickedCount} / {sortedPicklist.length}
                    </span>
                    <span className="block text-[10px] text-purple-600 dark:text-purple-400">
                      Items Picked
                    </span>
                  </div>

                  <button
                    onClick={downloadPicklistCsv}
                    className="py-1.5 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center gap-1.5 hover:bg-purple-100 dark:hover:bg-zinc-700 transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Picklist Items Table */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 uppercase font-mono font-bold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">Status</th>
                      <th className="py-2.5 px-3">Rack / Bin Location</th>
                      <th className="py-2.5 px-3">Part Number</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Assembly / Figure</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                    {sortedPicklist.map((part, idx) => {
                      const isPicked = Boolean(pickedState[part.part_no]);
                      const location = part.rack_bin || `RACK-${String.fromCharCode(65 + (idx % 6))}-${(idx % 12) + 1}`;

                      return (
                        <tr
                          key={idx}
                          onClick={() => togglePicked(part.part_no)}
                          className={`cursor-pointer transition-colors ${
                            isPicked
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 line-through opacity-70'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isPicked}
                              onChange={() => {}}
                              className="rounded text-purple-600 pointer-events-none"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-bold text-purple-600 dark:text-purple-400">
                            {location}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-zinc-900 dark:text-white">
                            {part.part_no}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-zinc-600 dark:text-zinc-400 truncate max-w-xs">
                            {part.description}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-zinc-500 truncate max-w-xs">
                            FIG {part.fig_no || ''} {part.fig_name || ''}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            {part.QTY || part[modelCode] || 1}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-zinc-700 dark:text-zinc-300">
                            ₹{part.mrp || 145}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
