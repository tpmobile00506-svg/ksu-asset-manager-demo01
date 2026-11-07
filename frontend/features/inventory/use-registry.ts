'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { groupFor, type Asset } from '@/shared/domain';

// สถานะของหน้าทะเบียน: ตัวกรอง (ค้นหา สาขา สภาพ หมวด ทะเบียน) การเรียง หน้า และรายการที่ติ๊กเลือก
// แยกเป็น hook เพราะ workspace ต้องใช้ด้วย: กดสาขาในกราฟหน้าภาพรวม → ตั้งตัวกรองสาขา, ออกจากระบบ → ล้างทั้งหมด
export const PAGE_SIZE = 40;
// ตัวเรียงภาษาไทยแบบตัวเลข สร้างครั้งเดียว (เร็วกว่า localeCompare พร้อมตัวเลือกทุกคู่ที่เทียบ)
const thaiCollator = new Intl.Collator('th', { numeric: true });

export function useRegistry(assets: Asset[], view: string) {
  const [search, setSearch] = useState(''),
    [branch, setBranch] = useState('all'),
    [condition, setCondition] = useState('all'),
    [category, setCategory] = useState('all'),
    [lifecycle, setLifecycle] = useState('active'),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<{ key: keyof Asset; dir: number }>({ key: 'createdAt', dir: -1 });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  // เปลี่ยนตัวกรองหรือเปลี่ยนหน้า → กลับไปหน้าแรกของผลลัพธ์ และล้างรายการที่เลือก
  useEffect(() => {
    setPage(0);
    setSelectedAssetIds([]);
  }, [search, branch, condition, category, lifecycle, view]);
  // ออกจากระบบ: คืนตัวกรองทุกช่องเป็นค่าเริ่มต้น
  const reset = useCallback(() => {
    setSearch('');
    setBranch('all');
    setCondition('all');
    setCategory('all');
    setLifecycle('active');
    setPage(0);
    setSelectedAssetIds([]);
  }, []);
  // กรองและเรียงใหม่เฉพาะเมื่อข้อมูลหรือตัวกรองเปลี่ยน (เดิมทำทุกครั้งที่หน้าจอวาดใหม่ แม้อยู่หน้าอื่น
  // 5,000 รายการบนมือถือเสียราว 1 วินาทีต่อการกดเมนู)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets
      .filter(
        a =>
          (lifecycle === 'all' || a.lifecycle === lifecycle) &&
          (branch === 'all' || a.branch === branch) &&
          (category === 'all' || groupFor(a) === category) &&
          (condition === 'all' || a.condition === condition) &&
          (!q || [a.code, a.name, a.serial, a.location, a.branch, a.groupName].join(' ').toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const av = a[sort.key] ?? '',
          bv = b[sort.key] ?? '';
        const main =
          (typeof av === 'number' && typeof bv === 'number' ? av - bv : thaiCollator.compare(String(av), String(bv))) *
          sort.dir;
        // ค่าเท่ากัน (เช่น แยกรายชิ้นพร้อมกัน วันที่นำเข้าเดียวกัน) เรียงตามรหัสแบบตัวเลข: (1), (2), … (10) ไม่ใช่ (1), (10), (2)
        return main || thaiCollator.compare(a.code, b.code);
      });
  }, [assets, lifecycle, branch, category, condition, search, sort]);
  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const pageAssets = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isAllPageSelected = pageAssets.length > 0 && pageAssets.every(a => selectedSet.has(a.id));
  const isSomePageSelected = pageAssets.some(a => selectedSet.has(a.id));
  const selectedActiveAssets = useMemo(
    () => filtered.filter(a => selectedSet.has(a.id) && a.lifecycle === 'active'),
    [filtered, selectedSet],
  );
  const toggleSelectAsset = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e && 'stopPropagation' in e) e.stopPropagation();
    setSelectedAssetIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const toggleSelectAllPage = () => {
    if (isAllPageSelected) {
      const pageIds = new Set(pageAssets.map(x => x.id));
      setSelectedAssetIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const next = new Set([...selectedAssetIds, ...pageAssets.map(x => x.id)]);
      setSelectedAssetIds(Array.from(next));
    }
  };
  const selectAllFiltered = () => {
    setSelectedAssetIds(filtered.map(x => x.id));
  };
  const clearSelection = () => {
    setSelectedAssetIds([]);
  };
  return {
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
    pageAssets,
    isAllPageSelected,
    isSomePageSelected,
    selectedActiveAssets,
    toggleSelectAsset,
    toggleSelectAllPage,
    selectAllFiltered,
    clearSelection,
    reset,
  };
}

export type Registry = ReturnType<typeof useRegistry>;
