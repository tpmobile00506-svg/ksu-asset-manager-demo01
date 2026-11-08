'use client';
import { Fragment } from 'react';
import {
  ArrowUpDown,
  ChevronRight,
  Download,
  Eye as ViewIcon,
  Pencil,
  QrCode,
  ScanLine,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  conditions,
  money,
  standardBranches,
  groupFor,
  assetGroups,
  branchAbbr,
  type Asset,
  type AwaitingApproval,
} from '@/shared/domain';
import { Badge, ConditionBadge, Pick, Empty, Pager, baht, statusLabel, type Any } from '@/frontend/components/common';
import AssetThumbnail from './asset-thumbnail';
import { RowActions } from './row-actions';
import { codeRange, commonValue, conditionCounts } from './piece-groups';
import type { Registry } from './use-registry';

// หน้าทะเบียนครุภัณฑ์: ปุ่ม (สแกน QR / ส่งออก / พิมพ์สติกเกอร์ QR) → ช่องค้นหาและตัวกรอง → แถบรายการที่เลือก
// → ตาราง (จอใหญ่) หรือการ์ด (มือถือ) ทีละ 40 แถว → ตัวเปลี่ยนหน้า
// ชิ้นที่แยกรายชิ้น (QR คนละดวง) รวมเป็นแถวเดียว กดเพื่อกางดูทีละชิ้น (piece-groups.ts)
// สถานะตัวกรองทั้งหมดอยู่ใน useRegistry() (use-registry.ts) หน้านี้แค่แสดงผลและส่งต่อการกด
export function RegistryView({
  registry,
  assets,
  activeCount,
  awaiting,
  editable,
  busy,
  open,
  onSelect,
  onScan,
  onExport,
  onOpenImports,
}: {
  registry: Registry;
  assets: Asset[];
  activeCount: number;
  awaiting: Map<string, AwaitingApproval>;
  editable: boolean;
  busy: boolean;
  open: (kind: string, rest?: Any) => void;
  onSelect: (asset: Asset) => void;
  onScan: () => void;
  onExport: () => void;
  onOpenImports: () => void;
}) {
  const {
    search,
    setSearch,
    branch,
    setBranch,
    condition,
    setCondition,
    category,
    setCategory,
    lifecycle,
    setLifecycle,
    page,
    setPage,
    sort,
    setSort,
    selectedAssetIds,
    filtered,
    rows,
    pageRows,
    selectedSet,
    isGroupOpen,
    toggleGroup,
    toggleSelectMany,
    isAllPageSelected,
    isSomePageSelected,
    selectedActiveAssets,
    toggleSelectAsset,
    toggleSelectAllPage,
    selectAllFiltered,
    clearSelection,
  } = registry;

  // สรุปของกลุ่มรายชิ้น (ใช้ทั้งแถวในตารางและการ์ดมือถือ)
  const groupSummary = (items: Asset[]) => {
    const ids = items.map(a => a.id);
    const picked = ids.filter(id => selectedSet.has(id)).length;
    const conditionsOf = conditionCounts(items);
    const waiting = items.filter(a => awaiting.has(a.id)).length;
    return {
      ids,
      first: items[0],
      count: items.length,
      picked,
      range: codeRange(items),
      name: commonValue(
        items.map(a => a.name),
        items[0].name + ' ฯลฯ',
      ),
      branch: commonValue(
        items.map(a => branchAbbr(a.branch) || '—'),
        'หลายสาขา',
      ),
      branchFull: commonValue(
        items.map(a => a.branch),
        'หลายสาขา',
      ),
      group: commonValue(items.map(groupFor), 'หลายหมวด'),
      location: commonValue(
        items.map(a => a.location || '—'),
        'หลายที่',
      ),
      quantity: items.reduce((sum, a) => sum + a.quantity, 0),
      totalSatang: items.reduce((sum, a) => sum + a.totalSatang, 0),
      conditionsOf,
      conditionText: [
        ...conditionsOf.map(([c, n]) => `${statusLabel(c)} ${n}`),
        ...(waiting ? [`รออนุมัติ ${waiting}`] : []),
      ].join(' · '),
      waiting,
    };
  };
  const groupBadges = (g: ReturnType<typeof groupSummary>) => (
    <span className="inline-flex flex-wrap items-center gap-1" title={g.conditionText}>
      {g.conditionsOf.map(([c, n]) => (
        <span key={c} className={'badge ' + c}>
          {statusLabel(c)} {n.toLocaleString('th-TH')}
        </span>
      ))}
      {g.waiting > 0 && <span className="badge awaiting">รออนุมัติ {g.waiting.toLocaleString('th-TH')}</span>}
    </span>
  );
  const groupCheckbox = (g: ReturnType<typeof groupSummary>, large = false) => (
    <input
      type="checkbox"
      aria-label={`เลือกทั้ง ${g.count} ชิ้นของ ${g.name}`}
      title={`เลือกทั้ง ${g.count} ชิ้น`}
      checked={g.picked === g.count}
      ref={el => {
        if (el) el.indeterminate = g.picked > 0 && g.picked < g.count;
      }}
      onChange={() => toggleSelectMany(g.ids)}
      className={large ? 'select-check select-check-lg' : 'select-check'}
    />
  );

  // แถวครุภัณฑ์ 1 รายการ · nested = ชิ้นที่กางออกมาจากแถวกลุ่ม (เยื้องเข้าไป)
  const assetRow = (a: Asset, nested = false) => {
    const isSelected = selectedSet.has(a.id);
    return (
      <TableRow
        key={a.id}
        className={`cursor-pointer ${nested ? 'is-piece' : ''} ${isSelected ? 'is-selected' : ''}`}
        onClick={() => onSelect(a)}
      >
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`เลือก ${a.code} ${a.name}`}
            checked={isSelected}
            onChange={e => toggleSelectAsset(a.id, e)}
            className="select-check"
          />
        </TableCell>
        <TableCell className="font-mono text-[12px] font-semibold text-blue-700" title={a.code}>
          {a.code}
        </TableCell>
        <TableCell className="font-medium text-slate-900" title={a.name}>
          {a.name}
        </TableCell>
        <TableCell className="text-center text-slate-700 hidden lg:table-cell" title={a.branch}>
          {branchAbbr(a.branch) || '—'}
        </TableCell>
        <TableCell className="text-slate-700 hidden xl:table-cell" title={groupFor(a)}>
          {groupFor(a)}
        </TableCell>
        <TableCell className="text-slate-600 hidden 2xl:table-cell" title={a.location}>
          {a.location || '—'}
        </TableCell>
        <TableCell className="num text-slate-700 hidden lg:table-cell">{a.quantity.toLocaleString('th-TH')}</TableCell>
        <TableCell className="num font-semibold text-slate-900">{money(a.totalSatang)}</TableCell>
        <TableCell className="text-center">
          <ConditionBadge condition={a.condition} awaiting={awaiting.get(a.id)} />
          {a.lifecycle !== 'active' && <Badge value={a.lifecycle} />}
        </TableCell>
        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
          <RowActions asset={a} editable={!!editable} open={open} view={() => onSelect(a)} />
        </TableCell>
      </TableRow>
    );
  };

  // แถวกลุ่มรายชิ้น: กดที่แถวเพื่อกาง/พับ · ติ๊กช่องซ้าย = เลือกทุกชิ้นในกลุ่ม
  const groupRow = (key: string, items: Asset[]) => {
    const g = groupSummary(items);
    const isOpen = isGroupOpen(key);
    return (
      <TableRow
        key={key}
        className={`piece-group cursor-pointer ${g.picked === g.count ? 'is-selected' : ''}`}
        onClick={() => toggleGroup(key)}
      >
        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
          {groupCheckbox(g)}
        </TableCell>
        <TableCell className="font-mono text-[12px] font-semibold text-blue-700" title={g.range}>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'พับ' : 'กางดู'}รายชิ้น ${g.name} ${g.range}`}
            onClick={e => {
              e.stopPropagation();
              toggleGroup(key);
            }}
            className="inline-flex items-center gap-1 max-w-full cursor-pointer"
          >
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
            <span className="truncate">{g.range}</span>
          </button>
        </TableCell>
        <TableCell className="font-medium text-slate-900" title={g.name}>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{g.name}</span>
            <span className="piece-tag" title={`แยกรายชิ้น ${g.count} ชิ้น QR คนละดวง · กดแถวเพื่อกางดู`}>
              รายชิ้น {g.count.toLocaleString('th-TH')}
            </span>
          </span>
        </TableCell>
        <TableCell className="text-center text-slate-700 hidden lg:table-cell" title={g.branchFull}>
          {g.branch}
        </TableCell>
        <TableCell className="text-slate-700 hidden xl:table-cell" title={g.group}>
          {g.group}
        </TableCell>
        <TableCell className="text-slate-600 hidden 2xl:table-cell" title={g.location}>
          {g.location}
        </TableCell>
        <TableCell className="num text-slate-700 hidden lg:table-cell">{g.quantity.toLocaleString('th-TH')}</TableCell>
        <TableCell className="num font-semibold text-slate-900">{money(g.totalSatang)}</TableCell>
        <TableCell className="text-center whitespace-normal">{groupBadges(g)}</TableCell>
        <TableCell>
          <span className="sr-only">กลุ่มรายชิ้น</span>
        </TableCell>
      </TableRow>
    );
  };

  // การ์ดมือถือ 1 รายการ · nested = ชิ้นที่กางออกมาจากการ์ดกลุ่ม
  const assetCard = (a: Asset, nested = false) => {
    const isSelected = selectedSet.has(a.id);
    return (
      <div
        key={a.id}
        className={`asset-card-item cursor-pointer transition-colors ${nested ? 'is-piece' : ''} ${isSelected ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20' : ''}`}
        onClick={() => onSelect(a)}
      >
        <div className="flex items-start gap-3">
          <AssetThumbnail name={a.name} imageUrl={a.imageUrl} onClick={() => onSelect(a)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`เลือก ${a.code} ${a.name}`}
                  checked={isSelected}
                  onChange={e => toggleSelectAsset(a.id, e)}
                  className="select-check select-check-lg"
                />
                <span className="text-xs text-slate-600">{groupFor(a)}</span>
              </div>
              <div className="flex items-center gap-1">
                <ConditionBadge condition={a.condition} awaiting={awaiting.get(a.id)} />
                {a.lifecycle !== 'active' && <Badge value={a.lifecycle} />}
              </div>
            </div>
            <span className="asset-name text-left font-bold text-slate-900 block line-clamp-2 leading-snug">
              {a.name}
            </span>
            <div className="font-mono text-xs font-bold text-blue-700 bg-blue-50/60 px-1.5 py-0.5 rounded border border-blue-100 inline-block mt-1 select-all">
              {a.code}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
          <div className="min-w-0">
            <span className="text-slate-600 block text-xs">ราคาต่อหน่วย</span>
            <strong className="text-slate-900 text-sm">{baht(a.unitSatang)}</strong>
            <span className="text-slate-600 text-xs block">
              {a.quantity.toLocaleString('th-TH')} ชิ้น · รวม {baht(a.totalSatang)}
            </span>
          </div>
          <div className="min-w-0">
            <span className="text-slate-600 block text-xs">สาขา / สถานที่</span>
            <span className="text-slate-800 font-medium block truncate">{a.branch}</span>
            <span className="text-slate-600 text-xs block truncate">{a.location || 'ยังไม่ระบุสถานที่'}</span>
          </div>
        </div>
        <div
          className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-slate-100"
          onClick={e => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-4 text-sm font-bold text-blue-600 bg-blue-50"
            onClick={() => onSelect(a)}
          >
            <ViewIcon size={12} className="mr-1" />
            ดูรายละเอียด
          </Button>
          {editable && a.lifecycle === 'active' && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 text-sm font-medium text-slate-600"
              onClick={() => open('edit', { asset: a })}
            >
              <Pencil size={12} className="mr-1" />
              แก้ไข
            </Button>
          )}
        </div>
      </div>
    );
  };

  // การ์ดมือถือของกลุ่มรายชิ้น: ปุ่มด้านล่างกาง/พับรายชิ้น
  const groupCard = (key: string, items: Asset[]) => {
    const g = groupSummary(items);
    const isOpen = isGroupOpen(key);
    return (
      <div
        key={key}
        className={`asset-card-item piece-group transition-colors ${g.picked === g.count ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20' : ''}`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-2">
            {groupCheckbox(g, true)}
            <span className="text-xs text-slate-600">{g.group}</span>
            <span className="piece-tag">QR รายชิ้น {g.count.toLocaleString('th-TH')} ดวง</span>
          </div>
          {groupBadges(g)}
        </div>
        <span className="asset-name text-left font-bold text-slate-900 block line-clamp-2 leading-snug">{g.name}</span>
        <div className="font-mono text-xs font-bold text-blue-700 mt-1 break-all">{g.range}</div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
          <div className="min-w-0">
            <span className="text-slate-600 block text-xs">จำนวน / มูลค่ารวม</span>
            <strong className="text-slate-900 text-sm">{g.quantity.toLocaleString('th-TH')} ชิ้น</strong>
            <span className="text-slate-600 text-xs block">รวม {baht(g.totalSatang)}</span>
          </div>
          <div className="min-w-0">
            <span className="text-slate-600 block text-xs">สาขา / สถานที่</span>
            <span className="text-slate-800 font-medium block truncate">{g.branchFull}</span>
            <span className="text-slate-600 text-xs block truncate">{g.location}</span>
          </div>
        </div>
        <div className="flex items-center justify-end mt-3 pt-2.5 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isOpen}
            className="h-9 px-4 text-sm font-bold text-blue-600 bg-blue-50"
            onClick={() => toggleGroup(key)}
          >
            <ChevronRight size={14} aria-hidden="true" className={`mr-1 ${isOpen ? 'rotate-90' : ''}`} />
            {isOpen ? 'พับรายชิ้น' : `ดูทั้ง ${g.count.toLocaleString('th-TH')} ชิ้น`}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          รายการครุภัณฑ์ <span className="badge ml-2">{filtered.length}</span>
        </h2>
        <div className="actions">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer bg-white text-blue-700 hover:bg-blue-50 border-blue-200"
            onClick={onScan}
          >
            <ScanLine size={15} />
            สแกน QR
          </Button>
          <Button variant="outline" size="sm" disabled={busy || !activeCount} onClick={onExport}>
            <Download size={15} />
            ส่งออก Excel
          </Button>
          {editable && selectedAssetIds.length === 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              disabled={!activeCount}
              onClick={() => open('qr', { assets: [] })}
            >
              <QrCode size={16} />
              พิมพ์สติกเกอร์ QR
            </Button>
          )}
        </div>
      </div>
      <div className="toolbar">
        <div className="searchbox relative flex items-center">
          <Search />
          <Input
            aria-label="ค้นหาครุภัณฑ์"
            placeholder="ค้นหาหมายเลข ชื่อ หรือ Serial…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={search ? 'pr-8' : ''}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1 text-slate-500 hover:text-slate-700 focus:outline-none p-2"
              aria-label="ล้างคำค้นหา"
              title="ล้างคำค้นหา"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <Pick
          label="สาขา"
          value={branch}
          onChange={setBranch}
          options={[
            ['all', 'ทุกสาขา'],
            ...Array.from(new Set([...standardBranches, ...assets.map(x => x.branch)].filter(Boolean))).map(
              x => [x, x] as [string, string],
            ),
          ]}
        />
        <Pick
          label="สภาพ"
          value={condition}
          onChange={setCondition}
          options={[['all', 'ทุกสภาพ'], ...Object.entries(conditions)]}
        />
        {/* ตัวกรองนี้กรองตามคอลัมน์ "หมวด" (groupFor) จึงใช้ชื่อเดียวกัน · "ประเภทครุภัณฑ์" เป็นอีกช่องหนึ่ง */}
        <Pick
          label="หมวด"
          value={category}
          onChange={setCategory}
          options={[['all', 'ทุกหมวด'], ...assetGroups.map(x => [x, x] as [string, string])]}
        />
        <Pick
          label="ทะเบียน"
          value={lifecycle}
          onChange={setLifecycle}
          options={[
            ['active', 'ที่ใช้อยู่'],
            ['disposed', 'จำหน่ายแล้ว'],
            ['split', 'ประวัติการแยกรายการ'],
            ['voided', 'ข้อมูลผิดพลาด'],
            ['all', 'ทั้งหมด (รวมประวัติ)'],
          ]}
        />
      </div>
      {selectedAssetIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/70 border border-blue-200 rounded-xl mb-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs">
              {selectedAssetIds.length}
            </span>
            <span className="text-sm font-semibold text-slate-800">
              เลือกอยู่ <span className="text-blue-700 font-bold">{selectedAssetIds.length}</span> รายการ
            </span>
            {selectedAssetIds.length < filtered.length && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs text-blue-600 hover:text-blue-800 underline font-medium ml-1 cursor-pointer"
              >
                (เลือกทั้งหมด {filtered.length} รายการ)
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button
                size="sm"
                disabled={!selectedActiveAssets.length}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer h-8 px-3"
                onClick={() => open('qr', { assets: selectedActiveAssets })}
              >
                <QrCode size={14} className="mr-1.5" />
                พิมพ์สติกเกอร์ QR ({selectedActiveAssets.length})
              </Button>
            )}
            {editable && (
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedActiveAssets.length}
                className="bg-white text-blue-700 border-blue-300 hover:bg-blue-50 text-xs font-semibold cursor-pointer h-8 px-3"
                onClick={() => open('requestMany', { assets: selectedActiveAssets })}
              >
                <Send size={14} className="mr-1.5" />
                ยื่นคำขอ ({selectedActiveAssets.length})
              </Button>
            )}
            {editable && (
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedActiveAssets.length}
                className="bg-white text-blue-700 border-blue-300 hover:bg-blue-50 text-xs font-semibold cursor-pointer h-8 px-3"
                onClick={() => open('bulkEdit', { assets: selectedActiveAssets })}
              >
                <Pencil size={14} className="mr-1.5" />
                แก้ไขที่เลือก ({selectedActiveAssets.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-800 bg-white border-slate-300 cursor-pointer"
              onClick={clearSelection}
            >
              <X size={13} className="mr-1" />
              ล้างที่เลือก
            </Button>
          </div>
        </div>
      )}
      {filtered.length ? (
        <>
          <div className="asset-table-wrapper hidden md:block">
            {/* ตารางพอดีจอ บรรทัดเดียวต่อแถว ไม่เลื่อนซ้ายขวา: จอแคบลงซ่อนคอลัมน์สำคัญน้อยทีละอัน (สถานที่ → หมวด → สาขา/จำนวน) ข้อมูลครบในหน้ารายละเอียด */}
            <Table className="registry-table" containerClassName="table-scroll-container registry-scroll">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมดในหน้านี้"
                      title="เลือกทั้งหมดในหน้านี้"
                      checked={isAllPageSelected}
                      ref={el => {
                        if (el) el.indeterminate = !isAllPageSelected && isSomePageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      className="select-check"
                    />
                  </TableHead>
                  {(
                    [
                      { label: 'หมายเลขครุภัณฑ์', key: 'code', cls: 'w-[200px]' },
                      { label: 'รายการ', key: 'name', cls: '' },
                      { label: 'สาขา', key: 'branch', cls: 'w-[80px] text-center hidden lg:table-cell' },
                      { label: 'หมวด', key: 'groupName', cls: 'w-[92px] hidden xl:table-cell' },
                      { label: 'สถานที่', key: 'location', cls: 'w-[160px] hidden 2xl:table-cell' },
                      { label: 'จำนวน', key: 'quantity', cls: 'w-[84px] num hidden lg:table-cell' },
                      { label: 'มูลค่า (บาท)', key: 'totalSatang', cls: 'w-[124px] num' },
                      { label: 'สภาพ', key: 'condition', cls: 'w-[88px] text-center' },
                      { label: '', key: null, cls: 'w-[76px]' },
                    ] as Array<{ label: string; key: keyof Asset | null; cls: string }>
                  ).map(col => (
                    <TableHead key={col.label || 'actions'} className={col.cls}>
                      {col.key ? (
                        <button
                          className="inline-flex items-center gap-1 cursor-pointer max-w-full"
                          onClick={() => setSort({ key: col.key!, dir: sort.key === col.key ? -sort.dir : 1 })}
                        >
                          <span className="truncate">{col.label}</span>
                          <ArrowUpDown
                            size={11}
                            className={`flex-shrink-0 ${sort.key === col.key ? 'text-blue-600 opacity-100' : 'opacity-40'}`}
                          />
                        </button>
                      ) : (
                        <span className="sr-only">จัดการ</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(row =>
                  row.kind === 'asset' ? (
                    assetRow(row.asset)
                  ) : (
                    <Fragment key={row.key}>
                      {groupRow(row.key, row.items)}
                      {isGroupOpen(row.key) && row.items.map(a => assetRow(a, true))}
                    </Fragment>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden asset-mobile-cards">
            {pageRows.map(row =>
              row.kind === 'asset' ? (
                assetCard(row.asset)
              ) : (
                <Fragment key={row.key}>
                  {groupCard(row.key, row.items)}
                  {isGroupOpen(row.key) && row.items.map(a => assetCard(a, true))}
                </Fragment>
              ),
            )}
          </div>
          <Pager page={page} total={rows.length} onChange={setPage} />
        </>
      ) : (
        <Empty title={activeCount ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีครุภัณฑ์ในทะเบียน'}>
          <p>{activeCount ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : 'นำเข้าจากไฟล์ Excel หรือกดปุ่ม “เพิ่มครุภัณฑ์”'}</p>
          {editable && !activeCount && (
            <Button variant="outline" onClick={onOpenImports}>
              ไปหน้านำเข้า Excel
            </Button>
          )}
        </Empty>
      )}
    </div>
  );
}
