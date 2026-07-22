"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { transliterate, getImgUrl } from "@/lib/utils";
import { Loader2, Plus, Trash2, X, Link2Off } from "lucide-react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

// Matches measures.short_title's CSS-class convention from the storefront
// (text-success/text-ends/text-muted/text-primary/text-danger) — keyed by
// measures.translation_id, which is what products.package stores.
const AVAILABILITY_COLOR: Record<number, string> = {
  1: "#10b981", // В наявності
  2: "#f59e0b", // Закінчується
  3: "#6b7280", // Очікується
  4: "#2563eb", // Під замовлення
  5: "#ef4444", // Немає в наявності
};

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface LangData {
  title: string;
  main_title: string;
  descr: string;
  text: string;
  heading: string;
  uri: string;
  seoTitle: string;
  seoKey: string;
  seoDescr: string;
}

export interface ColorGroup {
  langVariants: any[];
  photos: any[];
  photos2: any[];
}

interface Props {
  langVariants?: any[];
  colorGroups?: ColorGroup[];
  mainPhotos?: any[];
  mainPhotos2?: any[];
  mainChars?: any[];
  productCategories?: number[];
  productFilters?: number[];
  product?: any;
  categories: any[];
  measures: any[];
  filters: any[];
  langs: any[];
  mode: "create" | "edit";
}

type AllColor = { trId: number; langVariants: any[]; isMain: boolean };

function makeLangEntry(v: any): LangData {
  return {
    title: v.title ?? "",
    main_title: v.main_title ?? "",
    descr: v.descr ?? "",
    text: v.text ?? "",
    heading: v.heading ?? "",
    uri: v.uri ?? "",
    seoTitle: v.seoTitle ?? "",
    seoKey: v.seoKey ?? "",
    seoDescr: v.seoDescr ?? "",
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function ProductForm(props: Props) {
  if (props.mode === "edit" && props.langVariants) return <EditForm {...props} />;
  return <CreateForm {...props} />;
}

// ─── EDIT FORM ────────────────────────────────────────────────────────────────

function EditForm({
  langVariants = [],
  colorGroups: initialColorGroups = [],
  mainPhotos = [],
  mainPhotos2 = [],
  mainChars = [],
  productCategories = [],
  productFilters = [],
  categories,
  measures,
  filters,
  langs,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("main");
  const [activeLang, setActiveLang] = useState(
    langVariants.find((v) => v.lang === "uk")?.lang ?? langVariants[0]?.lang ?? "uk"
  );

  const baseVariant: any = langVariants.find((v) => v.lang === "uk") ?? langVariants[0] ?? {};

  // ── Color groups (can remove) ─────────────────────────────────────
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>(initialColorGroups);

  // ── All lang text data, keyed by translationId → lang → fields ───
  const [allLangData, setAllLangData] = useState<Record<number, Record<string, LangData>>>(() => {
    const result: Record<number, Record<string, LangData>> = {};
    result[baseVariant.translationId] = Object.fromEntries(langVariants.map((v) => [v.lang, makeLangEntry(v)]));
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (!ukV) continue;
      result[ukV.translationId] = Object.fromEntries(cg.langVariants.map((v: any) => [v.lang, makeLangEntry(v)]));
    }
    return result;
  });

  // ── Photos per color (lifted from ColorCard) ──────────────────────
  const [photosMap, setPhotosMap] = useState<Record<number, any[]>>(() => {
    const map: Record<number, any[]> = { [baseVariant.translationId]: mainPhotos };
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[ukV.translationId] = cg.photos;
    }
    return map;
  });
  const [photos2Map, setPhotos2Map] = useState<Record<number, any[]>>(() => {
    const map: Record<number, any[]> = { [baseVariant.translationId]: mainPhotos2 };
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[ukV.translationId] = cg.photos2;
    }
    return map;
  });

  // imgMap: головне фото (products.img) per translationId
  const [imgMap, setImgMap] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    const ukBase = langVariants.find((v: any) => v.lang === "uk") ?? langVariants[0];
    if (ukBase) map[(ukBase as any).translationId] = (ukBase as any).img ?? "";
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[(ukV as any).translationId] = (ukV as any).img ?? "";
    }
    return map;
  });
  const [mainImgUploading, setMainImgUploading] = useState(false);

  // ── Shared fields (price, qty, etc.) ─────────────────────────────
  const [common, setCommon] = useState({
    price: baseVariant.price ?? 0,
    price_sale: baseVariant.price_sale ?? "",
    price2: baseVariant.price2 ?? "",
    price2n: baseVariant.price2n ?? "",
    price3: baseVariant.price3 ?? "",
    price3n: baseVariant.price3n ?? "",
    measure: baseVariant.measure ? String(baseVariant.measure) : "0",
    minquantity: baseVariant.minquantity ?? 1,
    labelAction: baseVariant.labelAction ?? 0,
    popular: baseVariant.popular ?? 0,
    priority: baseVariant.priority ?? 0,
  });

  // ── Per-color active / pcode ──────────────────────────────────────
  const [activeMap, setActiveMap] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = { [baseVariant.translationId]: baseVariant.active ?? 1 };
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[ukV.translationId] = ukV.active ?? 1;
    }
    return map;
  });
  const [pcodes, setPcodes] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = { [baseVariant.translationId]: baseVariant.pcode ?? "" };
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[ukV.translationId] = ukV.pcode ?? "";
    }
    return map;
  });
  // "В наявності" — products.package (references measures.translation_id).
  // NOT products.active: `active` doesn't actually hide a product from the
  // storefront (verified against the live site) — `package` is what
  // product.php checks (via measures.can_be_added_to_cart) to show "Нема в
  // наявності" and disable the buy button. See product-form.tsx's "В
  // наявності" selector below and app/(admin)/products/page.tsx's list badge.
  const [packageMap, setPackageMap] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = { [baseVariant.translationId]: baseVariant.package ?? 1 };
    for (const cg of initialColorGroups) {
      const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
      if (ukV) map[ukV.translationId] = ukV.package ?? 1;
    }
    return map;
  });

  // ── Chars (main product only) ─────────────────────────────────────
  const [charsData, setCharsData] = useState<Record<string, { title: string; value: string }[]>>(() => {
    const map: Record<string, { title: string; value: string }[]> = {};
    for (const v of langVariants) {
      map[v.lang] = mainChars.filter((c: any) => c.pid === v.id).map((c: any) => ({ title: c.title, value: c.value ?? "" }));
    }
    return map;
  });

  // ── Categories ────────────────────────────────────────────────────
  const [selectedCategories, setSelectedCategories] = useState<number[]>(productCategories);
  const [selectedFilters, setSelectedFilters] = useState<number[]>(productFilters);
  const [cascadeMain, setCascadeMain] = useState("0");
  const [cascadeSub, setCascadeSub] = useState("0");
  const [cascadeType, setCascadeType] = useState("0");

  // ── Color dropdown + add modal ────────────────────────────────────
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [addColorModal, setAddColorModal] = useState(false);
  const [addPcodeInput, setAddPcodeInput] = useState("");
  const [addCurrentColorInput, setAddCurrentColorInput] = useState("");
  const [addNewColorInput, setAddNewColorInput] = useState("");
  const [addCurrentColorInputRu, setAddCurrentColorInputRu] = useState("");
  const [addNewColorInputRu, setAddNewColorInputRu] = useState("");
  const [addUriInput, setAddUriInput] = useState("");
  const [addingColor, setAddingColor] = useState(false);
  const [deletingColorTrId, setDeletingColorTrId] = useState<number | null>(null);

  // ── Styled confirm dialog (replaces browser confirm()) ────────────
  const [confirmState, setConfirmState] = useState<{
    message: string; subMessage?: string; destructive?: boolean;
    confirmLabel?: string; onConfirm: () => void;
  } | null>(null);

  function showConfirm(
    message: string,
    onConfirm: () => void,
    opts?: { subMessage?: string; destructive?: boolean; confirmLabel?: string }
  ) {
    setConfirmState({ message, onConfirm, ...opts });
  }

  // ── Translation ───────────────────────────────────────────────────
  const [translating, setTranslating] = useState(false);
  const [translateVersion, setTranslateVersion] = useState(0);

  // ── Active color ──────────────────────────────────────────────────
  const [activeColorTrId, setActiveColorTrId] = useState<number>(baseVariant.translationId);

  // ── Derived: flat list of all colors ─────────────────────────────
  const allColors: AllColor[] = [
    { trId: baseVariant.translationId, langVariants, isMain: true },
    ...colorGroups
      .map((cg) => {
        const ukV = cg.langVariants.find((v: any) => v.lang === "uk") ?? cg.langVariants[0];
        return { trId: ukV?.translationId as number, langVariants: cg.langVariants, isMain: false };
      })
      .filter((c) => c.trId != null),
  ];
  const activeColorEntry = allColors.find((c) => c.trId === activeColorTrId) ?? allColors[0];
  const activeLangVariants = activeColorEntry?.langVariants ?? langVariants;
  const activeLangs = langs.filter((l: any) => activeLangVariants.some((v: any) => v.lang === l.code));

  // ── Current text data ─────────────────────────────────────────────
  const ld = (allLangData[activeColorTrId] ?? {})[activeLang] ?? ({} as LangData);

  const setLD = (lang: string, k: keyof LangData, v: string) =>
    setAllLangData((prev) => ({
      ...prev,
      [activeColorTrId]: {
        ...(prev[activeColorTrId] ?? {}),
        [lang]: { ...(prev[activeColorTrId]?.[lang] ?? {}), [k]: v },
      },
    }));
  const setC = (k: string, v: unknown) => setCommon((prev) => ({ ...prev, [k]: v }));

  // ── Category helpers ──────────────────────────────────────────────
  const mainCats = categories.filter((c: any) => c.pid === 0);
  const subCats =
    cascadeMain !== "0"
      ? (() => { const m = categories.find((x: any) => x.id === parseInt(cascadeMain)); return m ? categories.filter((c: any) => c.pid === m.translationId) : []; })()
      : [];
  const typeCats =
    cascadeSub !== "0"
      ? (() => { const s = categories.find((x: any) => x.id === parseInt(cascadeSub)); return s ? categories.filter((c: any) => c.pid === s.translationId) : []; })()
      : [];

  function getCategoryPath(catId: number): string {
    const cat = categories.find((c: any) => c.id === catId);
    if (!cat) return `#${catId}`;
    if (cat.pid === 0) return cat.title;
    const parent = categories.find((c: any) => c.translationId === cat.pid);
    if (!parent || parent.pid === 0) return `${parent?.title ?? "?"} › ${cat.title}`;
    const grand = categories.find((c: any) => c.translationId === parent.pid);
    return `${grand?.title ?? "?"} › ${parent.title} › ${cat.title}`;
  }

  const [categoriesWarned, setCategoriesWarned] = useState(false);

  function warnCategoriesChange() {
    if (!categoriesWarned) {
      toast("Категорії будуть змінені для ВСІХ кольорів та мовних версій цього товару", { icon: "⚠️" } as any);
      setCategoriesWarned(true);
    }
  }

  function addCascadeCategory() {
    const idStr = cascadeType !== "0" ? cascadeType : cascadeSub !== "0" ? cascadeSub : cascadeMain;
    const id = parseInt(idStr);
    if (!id || selectedCategories.includes(id)) return;
    warnCategoriesChange();
    setSelectedCategories((prev) => [...prev, id]);
  }

  // ── Add color (with copy + color name replace) ────────────────────
  function closeDropdown() {
    setColorDropdownOpen(false);
  }

  function closeAddModal() {
    setAddColorModal(false);
    setAddPcodeInput("");
    setAddCurrentColorInput("");
    setAddNewColorInput("");
    setAddCurrentColorInputRu("");
    setAddNewColorInputRu("");
    setAddUriInput("");
  }

  async function handleUploadMainImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMainImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/products/${activeProductId}/main-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Помилка завантаження"); return; }
      setImgMap((prev) => ({ ...prev, [activeColorTrId]: data.img }));
      toast.success("Головне фото оновлено");
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setMainImgUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteMainImg() {
    setMainImgUploading(true);
    try {
      const res = await fetch(`/api/products/${activeProductId}/main-image`, { method: "DELETE" });
      if (!res.ok) { toast.error("Помилка видалення"); return; }
      setImgMap((prev) => ({ ...prev, [activeColorTrId]: "" }));
      toast.success("Головне фото видалено");
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setMainImgUploading(false);
    }
  }

  function handleWordSelect(lang: "uk" | "ru") {
    const sel = window.getSelection();
    if (!sel) return;
    const word = sel.toString().replace(/[.,!?;:()\[\]{}"'«»\-–—]/g, "").trim();
    if (!word || word.includes(" ")) return;
    if (lang === "uk") setAddCurrentColorInput(word);
    else setAddCurrentColorInputRu(word);
    sel.removeAllRanges();
  }

  async function handleAddColor() {
    if (!addPcodeInput.trim()) return;
    setAddingColor(true);
    try {
      const body: Record<string, unknown> = {
        pcode: addPcodeInput.trim(),
        uri: addUriInput.trim(),
      };
      const hasUk = addCurrentColorInput.trim() || addNewColorInput.trim();
      const hasRu = addCurrentColorInputRu.trim() || addNewColorInputRu.trim();
      if (hasUk || hasRu) {
        body.copyText = {
          currentColorName: addCurrentColorInput.trim(),
          newColorName: addNewColorInput.trim(),
          currentColorNameRu: addCurrentColorInputRu.trim(),
          newColorNameRu: addNewColorInputRu.trim(),
        };
      }
      const res = await fetch(`/api/products/${baseVariant.id}/colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Помилка"); return; }

      // Оновлюємо стейт без перезавантаження сторінки
      if (data.newTrId && data.newVariants?.length) {
        const mapped = (data.newVariants as any[]).map((v) => ({
          ...v,
          translationId: v.translation_id,
          labelAction: v.label_action,
          seoTitle: v.seo_title,
          seoKey: v.seo_key,
          seoDescr: v.seo_descr,
        }));
        const ukV = mapped.find((v) => v.lang === "uk") ?? mapped[0];
        const newTrId: number = data.newTrId;

        setColorGroups((prev) => [...prev, { langVariants: mapped, photos: [], photos2: [] }]);
        setAllLangData((prev) => ({
          ...prev,
          [newTrId]: Object.fromEntries(mapped.map((v) => [v.lang, makeLangEntry(v)])),
        }));
        setPcodes((prev) => ({ ...prev, [newTrId]: ukV?.pcode ?? "" }));
        setActiveMap((prev) => ({ ...prev, [newTrId]: ukV?.active ?? 1 }));
        setPhotosMap((prev) => ({ ...prev, [newTrId]: [] }));
        setPhotos2Map((prev) => ({ ...prev, [newTrId]: [] }));
        setActiveColorTrId(newTrId);
        setActiveTab("photos");
      }

      closeAddModal();
      toast.success("Колір додано!");
      toast.warning("Не забудьте додати фото для нового кольору!");
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setAddingColor(false);
    }
  }

  // ── Soft unlink color from group ──────────────────────────────────
  function handleRemoveColor(colorTranslationId: number) {
    showConfirm(
      "Від'єднати цей колір від групи?",
      () => doRemoveColor(colorTranslationId),
      { subMessage: "Товар залишиться в базі, лише зникне з цієї групи кольорів." }
    );
  }
  async function doRemoveColor(colorTranslationId: number) {
    const res = await fetch(`/api/products/${baseVariant.id}/colors`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorTranslationId }),
    });
    if (!res.ok) { toast.error("Помилка"); return; }
    setColorGroups((prev) =>
      prev.filter((cg) => {
        const ukV = cg.langVariants.find((v) => v.lang === "uk") ?? cg.langVariants[0];
        return ukV?.translationId !== colorTranslationId;
      })
    );
    if (activeColorTrId === colorTranslationId) setActiveColorTrId(baseVariant.translationId);
    toast.success("Колір від'єднано");
  }

  // ── Hard delete color (both lang versions) ────────────────────────
  function handleDeleteColor(colorTranslationId: number) {
    showConfirm(
      "Видалити цей колір повністю?",
      () => doDeleteColor(colorTranslationId),
      {
        subMessage: "Буде видалено обидві версії (UK та RU) та всі фото. Цю дію не можна відмінити.",
        destructive: true,
        confirmLabel: "Видалити",
      }
    );
  }
  async function doDeleteColor(colorTranslationId: number) {
    setDeletingColorTrId(colorTranslationId);
    try {
      const res = await fetch(`/api/products/${baseVariant.id}/colors`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorTranslationId, hardDelete: true }),
      });
      if (!res.ok) { toast.error("Помилка видалення"); return; }
      setColorGroups((prev) =>
        prev.filter((cg) => {
          const ukV = cg.langVariants.find((v) => v.lang === "uk") ?? cg.langVariants[0];
          return ukV?.translationId !== colorTranslationId;
        })
      );
      if (activeColorTrId === colorTranslationId) setActiveColorTrId(baseVariant.translationId);
      toast.success("Колір видалено");
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setDeletingColorTrId(null);
    }
  }

  // ── RU→UA translation for whole group ────────────────────────────
  function handleTranslateGroup() {
    showConfirm(
      "Перекласти описи (RU→UA) для всієї групи кольорів?",
      doTranslateGroup,
      {
        subMessage: "Це перезапише Повний опис та Короткий опис для всіх UK-версій (поточний товар + всі кольори).",
        confirmLabel: "Перекласти",
      }
    );
  }
  async function doTranslateGroup() {
    setTranslating(true);
    try {
      const productIds = allColors
        .map((c) => c.langVariants.find((v: any) => v.lang === "uk")?.id)
        .filter(Boolean) as number[];

      const res = await fetch("/api/translate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Помилка перекладу"); return; }

      // Update allLangData for all translated colors
      setAllLangData((prev) => {
        const next = { ...prev };
        for (const item of data.results as any[]) {
          for (const color of allColors) {
            const ukV = color.langVariants.find((v: any) => v.lang === "uk");
            if (ukV?.id === item.id) {
              next[color.trId] = {
                ...(next[color.trId] ?? {}),
                uk: {
                  ...(next[color.trId]?.uk ?? {}),
                  ...(item.text !== undefined ? { text: item.text } : {}),
                  ...(item.descr !== undefined ? { descr: item.descr } : {}),
                },
              };
              break;
            }
          }
        }
        return next;
      });
      setTranslateVersion((v) => v + 1);
      toast.success(`Перекладено ${(data.results as any[]).length} товарів.`);
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setTranslating(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    try {
      const pricePayload = {
        price: parseFloat(String(common.price)) || 0,
        price_sale: common.price_sale !== "" ? parseFloat(String(common.price_sale)) : null,
        price2: common.price2 !== "" ? parseFloat(String(common.price2)) : null,
        price2n: common.price2n !== "" ? parseInt(String(common.price2n)) : null,
        price3: common.price3 !== "" ? parseFloat(String(common.price3)) : null,
        price3n: common.price3n !== "" ? parseInt(String(common.price3n)) : null,
        measure: common.measure !== "0" ? parseInt(common.measure) : null,
        minquantity: parseFloat(String(common.minquantity)) || 1,
        label_action: parseInt(String(common.labelAction)),
        popular: parseInt(String(common.popular)),
        priority: parseInt(String(common.priority)),
      };

      // Save ALL colors' lang variants with their text data
      const allColorSaves = allColors.flatMap(({ trId, langVariants: colorLangVars, isMain }) => {
        const colorLd = allLangData[trId] ?? {};
        return colorLangVars.map((v) => {
          const textData = colorLd[v.lang] ?? {};
          return fetch(`/api/products/${v.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...pricePayload,
              active: parseInt(String(activeMap[trId] ?? 1)),
              package: parseInt(String(packageMap[trId] ?? 1)),
              pcode: pcodes[trId] ?? "",
              title: textData.title ?? "",
              main_title: textData.main_title ?? "",
              descr: textData.descr ?? "",
              text: textData.text ?? "",
              heading: textData.heading ?? "",
              uri: textData.uri ?? "",
              seo_title: textData.seoTitle ?? "",
              seo_key: textData.seoKey ?? "",
              seo_descr: textData.seoDescr ?? "",
              ...(v.lang === "uk" ? { categoryIds: selectedCategories } : {}),
            }),
          });
        });
      });

      // Save main product chars
      const charsSaves = langVariants.map((v) =>
        fetch(`/api/products/${v.id}/chars`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chars: charsData[v.lang] ?? [], lang: v.lang }),
        })
      );

      // Save filter-value assignments (shared across this translationId's lang variants)
      const filtersSave = fetch(`/api/products/${baseVariant.id}/filters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterIds: selectedFilters }),
      });

      await Promise.all([...allColorSaves, ...charsSaves, filtersSave]);
      toast.success("Збережено!");
      router.refresh();
    } catch {
      toast.error("Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "main", label: "Основне" },
    { id: "prices", label: "Ціни" },
    { id: "photos", label: "Фото" },
    { id: "categories", label: "Категорії" },
    { id: "filters", label: "Фільтри" },
    { id: "chars", label: "Характеристики" },
    { id: "seo", label: "SEO" },
  ];

  const activeColorHasNoPhotos = !imgMap[activeColorTrId];

  // Find productId for active color (for photo upload)
  const activeProductId = activeLangVariants.find((v: any) => v.lang === "uk")?.id ?? baseVariant.id;

  return (
    <div className="p-6">

      {/* ── Color dropdown ──────────────────────────────────────────── */}
      {colorDropdownOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 98 }}
          onClick={closeDropdown}
        />
      )}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setColorDropdownOpen((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 14px", borderRadius: 8,
            border: "1.5px solid #6366f1", background: "#eef2ff", color: "#4f46e5",
            fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none",
          }}
        >
          <span>{pcodes[activeColorTrId] || `tid:${activeColorTrId}`}</span>
          {activeColorEntry?.isMain && <span style={{ fontSize: 10, opacity: 0.45, fontWeight: 400 }}>основний</span>}
          <span style={{ fontSize: 10, opacity: 0.55 }}>▾</span>
          {allColors.length > 1 && (
            <span style={{
              background: "#6366f1", color: "#fff",
              borderRadius: 10, fontSize: 10, padding: "1px 7px", fontWeight: 700, marginLeft: 2,
            }}>
              +{allColors.length - 1}
            </span>
          )}
        </button>

        {colorDropdownOpen && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 99,
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.13)",
              width: 380, maxHeight: 520, overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Color grid - 2 columns */}
            <div style={{ padding: "8px 8px 4px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
              {allColors.map((color) => {
                const isActiveColor = color.trId === activeColorTrId;
                const pcode = pcodes[color.trId] || `tid:${color.trId}`;
                const isDeletingThis = deletingColorTrId === color.trId;
                return (
                  <div key={color.trId} style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: 6, background: isActiveColor ? "#f0f0ff" : "transparent" }}>
                    <button
                      type="button"
                      onClick={() => { setActiveColorTrId(color.trId); closeDropdown(); }}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px", borderRadius: 6, border: "none",
                        background: "transparent",
                        color: isActiveColor ? "#4f46e5" : "var(--text)",
                        fontSize: 12.5, fontWeight: isActiveColor ? 700 : 500,
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                        background: AVAILABILITY_COLOR[packageMap[color.trId] ?? 1] ?? "#6b7280",
                      }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pcode}</span>
                      {color.isMain && <span style={{ fontSize: 9, opacity: 0.4 }}>★</span>}
                      {isActiveColor && <span style={{ fontSize: 9, marginLeft: "auto", opacity: 0.5 }}>✓</span>}
                    </button>
                    {!color.isMain && (
                      <button
                        type="button"
                        onClick={() => handleDeleteColor(color.trId)}
                        disabled={isDeletingThis}
                        title="Видалити обидві версії (UK + RU)"
                        style={{
                          background: "none", border: "none", cursor: isDeletingThis ? "wait" : "pointer",
                          color: "#ef4444", padding: "4px 6px", flexShrink: 0, borderRadius: 4,
                          opacity: isDeletingThis ? 0.5 : 1,
                          display: "flex", alignItems: "center",
                        }}
                      >
                        {isDeletingThis ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Divider + Add color button */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px 12px" }}>
              {true && (
                <button
                  type="button"
                  onClick={() => { closeDropdown(); setAddUriInput(baseVariant.uri ?? ""); setAddColorModal(true); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12.5, color: "#6366f1", background: "none", border: "none",
                    cursor: "pointer", padding: "4px 2px", fontWeight: 500,
                  }}
                >
                  <Plus size={14} /> Додати колір
                </button>
              )}

            </div>
          </div>
        )}
      </div>

      {/* ── Active color meta (pcode + active) ─────────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, padding: "8px 14px", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Артикул:</span>
          <input
            value={pcodes[activeColorTrId] ?? ""}
            onChange={(e) => setPcodes((p) => ({ ...p, [activeColorTrId]: e.target.value }))}
            placeholder="pcode"
            style={{
              fontSize: 12, padding: "3px 8px", borderRadius: 5,
              border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
              width: 140, outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>В наявності:</span>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: AVAILABILITY_COLOR[packageMap[activeColorTrId] ?? 1] ?? "#6b7280",
          }} />
          <select
            value={packageMap[activeColorTrId] ?? 1}
            onChange={(e) => setPackageMap((p) => ({ ...p, [activeColorTrId]: parseInt(e.target.value) }))}
            title="Визначає, чи показується товар доступним для купівлі на сайті (products.package)"
            style={{
              fontSize: 12, padding: "3px 8px", borderRadius: 5,
              border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: "pointer",
            }}
          >
            {measures.map((m: any) => (
              <option key={m.translationId ?? m.translation_id} value={m.translationId ?? m.translation_id}>{m.title}</option>
            ))}
          </select>
        </div>
        {!activeColorEntry?.isMain && (
          <button
            type="button"
            onClick={() => handleRemoveColor(activeColorTrId)}
            title="Від'єднати (не видаляти)"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto", padding: "2px 6px" }}
          >
            <Link2Off size={13} /> Від'єднати
          </button>
        )}
      </div>

      {/* Language selector */}
      {activeLangs.length > 1 && (
        <div className="flex gap-1 mb-4 items-center">
          <span className="text-xs text-gray-400 mr-2">Мова:</span>
          {activeLangs.map((l: any) => (
            <button
              key={l.code}
              onClick={() => setActiveLang(l.code)}
              className={`px-3 py-1 text-sm rounded-md font-medium border transition-colors ${
                activeLang === l.code
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
              }`}
            >
              {l.title || l.code.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b overflow-x-auto">
        {tabs.map((tab) => {
          const showPhotoAlert = tab.id === "photos" && activeColorHasNoPhotos;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "photos" && activeColorHasNoPhotos) {
                  toast.warning("Не забудьте додати фото для цього кольору!");
                }
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {showPhotoAlert && (
                <span style={{ color: "#f59e0b", fontWeight: 900, fontSize: 15, lineHeight: 1 }}>!</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Основне ──────────────────────────────────────────────── */}
      {activeTab === "main" && (
        <div className="grid gap-6 max-w-3xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Назва * <span className="text-gray-400 font-normal">({activeLang.toUpperCase()})</span></Label>
              <Input value={ld.title} onChange={(e) => setLD(activeLang, "title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Заголовок (H1) <span className="text-gray-400 font-normal">({activeLang.toUpperCase()})</span></Label>
              <Input value={ld.main_title} onChange={(e) => setLD(activeLang, "main_title", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>URI (slug) <span className="text-gray-400 font-normal">({activeLang.toUpperCase()})</span></Label>
            <Input value={ld.uri} onChange={(e) => setLD(activeLang, "uri", e.target.value)} />
          </div>
          {activeColorEntry?.isMain && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Мінімальна кількість</Label>
                <Input type="number" value={common.minquantity} onChange={(e) => setC("minquantity", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Пріоритет</Label>
                <Input type="number" value={common.priority} onChange={(e) => setC("priority", e.target.value)} />
              </div>
            </div>
          )}
          {activeColorEntry?.isMain && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Акційний</Label>
                <Select value={String(common.labelAction)} onValueChange={(v) => setC("labelAction", parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="0">Ні</SelectItem><SelectItem value="1">Так</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Популярний</Label>
                <Select value={String(common.popular)} onValueChange={(v) => setC("popular", parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="0">Ні</SelectItem><SelectItem value="1">Так</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Label>Короткий опис <span className="text-gray-400 font-normal">({activeLang.toUpperCase()})</span></Label>
              {activeLang === "uk" && (
                <button
                  type="button"
                  onClick={handleTranslateGroup}
                  disabled={translating}
                  title={`Перекласти описи (RU→UA) для цього товару та ${allColors.length - 1} кольорів`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: "1px solid var(--border)", cursor: translating ? "wait" : "pointer",
                    background: "var(--bg-secondary)", color: "var(--text-muted)",
                    opacity: translating ? 0.7 : 1,
                  }}
                >
                  {translating
                    ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Перекладаємо...</>
                    : <>🌐 Перекласти всі описи RU→UA</>}
                </button>
              )}
            </div>
            <RichTextEditor key={`descr-${activeColorTrId}-${activeLang}-${translateVersion}`} value={ld.descr} onChange={(v) => setLD(activeLang, "descr", v)} rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Повний опис <span className="text-gray-400 font-normal">({activeLang.toUpperCase()})</span></Label>
            <RichTextEditor key={`text-${activeColorTrId}-${activeLang}-${translateVersion}`} value={ld.text} onChange={(v) => setLD(activeLang, "text", v)} rows={8} />
          </div>
        </div>
      )}

      {/* ── Ціни ─────────────────────────────────────────────────── */}
      {activeTab === "prices" && (
        <div className="grid gap-4 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ціна $ *</Label>
              <Input type="number" step="0.01" value={common.price} onChange={(e) => setC("price", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Акційна ціна</Label>
              <Input type="number" step="0.01" value={common.price_sale} onChange={(e) => setC("price_sale", e.target.value)} placeholder="Залишити порожнім" />
            </div>
          </div>
          <div className="border rounded-md p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Оптові ціни</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Ціна 2</Label><Input type="number" step="0.01" value={common.price2} onChange={(e) => setC("price2", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Від (кількість)</Label><Input type="number" value={common.price2n} onChange={(e) => setC("price2n", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Ціна 3</Label><Input type="number" step="0.01" value={common.price3} onChange={(e) => setC("price3", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Від (кількість)</Label><Input type="number" value={common.price3n} onChange={(e) => setC("price3n", e.target.value)} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Фото ─────────────────────────────────────────────────── */}
      {activeTab === "photos" && (
        <div className="max-w-3xl space-y-8">
          {/* Основне фото — поле products.img */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Основне фото</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {imgMap[activeColorTrId] ? (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImgUrl(imgMap[activeColorTrId], "products") ?? ""}
                    alt=""
                    className="h-32 w-32 rounded-md object-cover border"
                  />
                  <button
                    type="button"
                    onClick={handleDeleteMainImg}
                    disabled={mainImgUploading}
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 self-center">Основне фото відсутнє</p>
              )}
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadMainImg}
                disabled={mainImgUploading}
              />
              <Button variant="outline" size="sm" disabled={mainImgUploading} asChild>
                <span>{mainImgUploading ? "Завантаження..." : imgMap[activeColorTrId] ? "Змінити фото" : "Додати фото"}</span>
              </Button>
            </label>
          </div>

          {/* Галерея — products_photos */}
          <PhotosSection
            productId={activeProductId}
            photos={photosMap[activeColorTrId] ?? []}
            setPhotos={(fn) => setPhotosMap((m) => ({ ...m, [activeColorTrId]: typeof fn === "function" ? fn(m[activeColorTrId] ?? []) : fn }))}
          />
        </div>
      )}

      {/* ── Категорії ────────────────────────────────────────────── */}
      {activeTab === "categories" && (
        <div className="max-w-2xl space-y-4">
          {allColors.length > 1 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#854d0e" }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
              <span>Зміна категорій застосується до <strong>всіх {allColors.length} кольорів</strong> цього товару.</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Основна категорія</Label>
              <Select value={cascadeMain} onValueChange={(v) => { setCascadeMain(v); setCascadeSub("0"); setCascadeType("0"); }}>
                <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— Оберіть —</SelectItem>
                  {mainCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Підкатегорія</Label>
              <Select value={cascadeSub} onValueChange={(v) => { setCascadeSub(v); setCascadeType("0"); }} disabled={subCats.length === 0}>
                <SelectTrigger><SelectValue placeholder={subCats.length === 0 ? "—" : "Оберіть..."} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— Оберіть —</SelectItem>
                  {subCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={cascadeType} onValueChange={setCascadeType} disabled={typeCats.length === 0}>
                <SelectTrigger><SelectValue placeholder={typeCats.length === 0 ? "—" : "Оберіть..."} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— Оберіть —</SelectItem>
                  {typeCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addCascadeCategory} disabled={cascadeMain === "0"}>
            <Plus className="h-4 w-4 mr-1" />Додати до категорій
          </Button>
          {selectedCategories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Обрано</p>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((catId) => (
                  <div key={catId} className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1 text-sm">
                    <span>{getCategoryPath(catId)}</span>
                    <button type="button" onClick={() => { warnCategoriesChange(); setSelectedCategories((p) => p.filter((x) => x !== catId)); }} className="text-gray-400 hover:text-red-500 ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Фільтри ──────────────────────────────────────────────── */}
      {activeTab === "filters" && (
        <div className="max-w-2xl space-y-4">
          <p className="text-xs text-gray-400">
            Обрані значення визначають, у яких фільтрах на сайті зʼявиться цей товар.
          </p>
          {filters.length === 0 && (
            <p className="text-sm text-gray-400">Фільтри ще не створені (розділ «Фільтри каталогу»).</p>
          )}
          {filters.map((filter: any) => (
            <div key={filter.id} className="border rounded-md overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 font-medium text-sm">{filter.title}</div>
              <div className="p-3 flex flex-wrap gap-2">
                {filter.filters.map((ff: any) => (
                  <label key={ff.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedFilters.includes(ff.translationId)}
                      onChange={(e) => setSelectedFilters((p) => e.target.checked ? [...p, ff.translationId] : p.filter((x) => x !== ff.translationId))}
                      className="h-4 w-4 rounded border-gray-300" />
                    {ff.title}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Характеристики ───────────────────────────────────────── */}
      {activeTab === "chars" && (
        <div className="max-w-xl space-y-3">
          {!activeColorEntry?.isMain && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Характеристики редагуються тільки для основного кольору.
            </p>
          )}
          {activeColorEntry?.isMain && (
            <>
              <p className="text-xs text-gray-400">Мова: <strong>{activeLang.toUpperCase()}</strong></p>
              <div className="space-y-2">
                {(charsData[activeLang] ?? []).map((char, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="Характеристика" value={char.title}
                      onChange={(e) => setCharsData((p) => ({ ...p, [activeLang]: p[activeLang].map((c, j) => j === i ? { ...c, title: e.target.value } : c) }))}
                      className="w-48" />
                    <Input placeholder="Значення" value={char.value}
                      onChange={(e) => setCharsData((p) => ({ ...p, [activeLang]: p[activeLang].map((c, j) => j === i ? { ...c, value: e.target.value } : c) }))} />
                    <button onClick={() => setCharsData((p) => ({ ...p, [activeLang]: p[activeLang].filter((_, j) => j !== i) }))}
                      className="text-red-400 hover:text-red-600 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm"
                onClick={() => setCharsData((p) => ({ ...p, [activeLang]: [...(p[activeLang] ?? []), { title: "", value: "" }] }))}>
                <Plus className="h-4 w-4 mr-1" />Додати характеристику
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Кольори (список групи) ───────────────────────────────── */}
      {activeTab === "colors" && (
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs text-gray-400 mb-3">Натисніть «Додати колір» у дропдауні вгорі, щоб додати новий колір до групи.</p>
          {allColors.map((color) => {
            const isActive = color.trId === activeColorTrId;
            const pcode = pcodes[color.trId] || `tid:${color.trId}`;
            const ukV = color.langVariants.find((v: any) => v.lang === "uk") ?? color.langVariants[0];
            const isDeletingThis = deletingColorTrId === color.trId;
            return (
              <div
                key={color.trId}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                  border: `1.5px solid ${isActive ? "#6366f1" : "var(--border)"}`,
                  borderRadius: 8, background: isActive ? "#f5f3ff" : "var(--bg)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#6366f1" : "var(--text)", minWidth: 110, flexShrink: 0 }}>
                  {pcode}
                  {color.isMain && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--text-muted)", fontWeight: 400 }}>★</span>}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(allLangData[color.trId] ?? {})["uk"]?.title || ukV?.title || "—"}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11, padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                  background: "var(--bg-secondary)",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: AVAILABILITY_COLOR[packageMap[color.trId] ?? 1] ?? "#6b7280",
                  }} />
                  {measures.find((m: any) => (m.translationId ?? m.translation_id) === (packageMap[color.trId] ?? 1))?.title ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={() => { setActiveColorTrId(color.trId); setActiveTab("main"); }}
                  style={{
                    fontSize: 11.5, padding: "3px 10px", borderRadius: 5, flexShrink: 0,
                    border: "1px solid var(--border)", background: "var(--bg-secondary)",
                    color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Редагувати
                </button>
                {!color.isMain && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRemoveColor(color.trId)}
                      title="Від'єднати (не видаляти)"
                      style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
                    >
                      <Link2Off size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteColor(color.trId)}
                      disabled={isDeletingThis}
                      title="Видалити обидві версії (UK + RU)"
                      style={{ color: "#ef4444", background: "none", border: "none", cursor: isDeletingThis ? "wait" : "pointer", display: "flex", alignItems: "center", flexShrink: 0, opacity: isDeletingThis ? 0.5 : 1 }}
                    >
                      {isDeletingThis ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── SEO ──────────────────────────────────────────────────── */}
      {activeTab === "seo" && (
        <div className="grid gap-4 max-w-2xl">
          <p className="text-xs text-gray-400">Мова: <strong>{activeLang.toUpperCase()}</strong></p>
          <div className="space-y-1.5"><Label>SEO заголовок</Label><Input value={ld.seoTitle} onChange={(e) => setLD(activeLang, "seoTitle", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SEO ключові слова</Label><Textarea rows={2} value={ld.seoKey} onChange={(e) => setLD(activeLang, "seoKey", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SEO опис</Label><Textarea rows={3} value={ld.seoDescr} onChange={(e) => setLD(activeLang, "seoDescr", e.target.value)} /></div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Зберегти зміни
        </Button>
        <Button variant="outline" onClick={() => router.push("/products")}>Скасувати</Button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Add color modal ───────────────────────────────────────── */}
      {addColorModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAddModal(); }}
        >
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: "28px 32px", width: 660, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>
              Додати колір
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 22px" }}>
              Буде створено UK та RU версії товару, скопійовані з&nbsp;
              <strong>{pcodes[baseVariant.translationId] || "основного товару"}</strong>.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Pcode */}
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                  Артикул нового кольору (pcode)
                </label>
                <input
                  autoFocus
                  placeholder="напр. m2845"
                  value={addPcodeInput}
                  onChange={(e) => setAddPcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && closeAddModal()}
                  style={{
                    width: "100%", fontSize: 13.5, padding: "8px 12px", borderRadius: 8,
                    border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "5px 0 0" }}>
                  Якщо товар з таким артикулом вже є — він буде прилінкований. Якщо ні — створиться новий.
                </p>
              </div>

              {/* Slug (uri) */}
              {(() => {
                const uriUnchanged = !addUriInput.trim() || addUriInput.trim() === (baseVariant.uri ?? "").trim();
                return (
                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                      Slug (URI) нового кольору
                    </label>
                    <input
                      placeholder={baseVariant.uri ?? ""}
                      value={addUriInput}
                      onChange={(e) => setAddUriInput(e.target.value)}
                      style={{
                        width: "100%", fontSize: 13.5, padding: "8px 12px", borderRadius: 8,
                        border: `1.5px solid ${uriUnchanged ? "#f59e0b" : "#22c55e"}`,
                        background: "var(--bg)", color: "var(--text)",
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {uriUnchanged ? (
                      <p style={{ fontSize: 11, color: "#b45309", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>⚠</span> Скопійовано з основного товару — відредагуйте slug для нового кольору.
                        Без змін сабміт заблоковано.
                      </p>
                    ) : (
                      <p style={{ fontSize: 11, color: "#16a34a", margin: "5px 0 0" }}>✓ Slug змінено</p>
                    )}
                  </div>
                );
              })()}

              {/* Descriptions — double-click a word to pick it */}
              {(() => {
                const ruVar: any = langVariants.find((v: any) => v.lang === "ru");
                const ukText = stripHtml(baseVariant.text || baseVariant.descr);
                const ruText = ruVar ? stripHtml(ruVar.text || ruVar.descr) : "";
                const boxStyle: React.CSSProperties = {
                  maxHeight: 110, overflowY: "auto", fontSize: 12, lineHeight: 1.6,
                  padding: "8px 10px", borderRadius: 7,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", cursor: "text", userSelect: "text",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                };
                return (
                  <div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
                      Двічі клікни на слово в описі — воно підставиться у поле поточного кольору
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6366f1", background: "#eef2ff", borderRadius: 4, padding: "1px 7px" }}>UK</span>
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>опис</span>
                        </div>
                        <div style={boxStyle} onDoubleClick={() => handleWordSelect("uk")}>
                          {ukText || <em style={{ color: "var(--text-muted)" }}>Немає тексту</em>}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#ef4444", background: "#fef2f2", borderRadius: 4, padding: "1px 7px" }}>RU</span>
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>опис</span>
                        </div>
                        <div style={boxStyle} onDoubleClick={() => handleWordSelect("ru")}>
                          {ruText || <em style={{ color: "var(--text-muted)" }}>Немає тексту</em>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Color name replacement */}
              <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", margin: "0 0 12px" }}>
                  Замінити назву кольору у текстах
                </p>

                {/* UK row */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 22px 1fr", gap: 8, alignItems: "end", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", padding: "7px 0", minWidth: 24, textAlign: "center" }}>UK</span>
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Поточна назва</label>
                    <input
                      placeholder="напр. червоний"
                      value={addCurrentColorInput}
                      onChange={(e) => setAddCurrentColorInput(e.target.value)}
                      style={{ width: "100%", fontSize: 12.5, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, paddingBottom: 6 }}>→</div>
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Нова назва</label>
                    <input
                      placeholder="напр. синій"
                      value={addNewColorInput}
                      onChange={(e) => setAddNewColorInput(e.target.value)}
                      style={{ width: "100%", fontSize: 12.5, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                {/* RU row */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 22px 1fr", gap: 8, alignItems: "end" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", padding: "7px 0", minWidth: 24, textAlign: "center" }}>RU</span>
                  <div>
                    <input
                      placeholder="напр. красный"
                      value={addCurrentColorInputRu}
                      onChange={(e) => setAddCurrentColorInputRu(e.target.value)}
                      style={{ width: "100%", fontSize: 12.5, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, paddingBottom: 6 }}>→</div>
                  <div>
                    <input
                      placeholder="напр. синий"
                      value={addNewColorInputRu}
                      onChange={(e) => setAddNewColorInputRu(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !addingColor && addPcodeInput.trim() && handleAddColor()}
                      style={{ width: "100%", fontSize: 12.5, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0" }}>
                  Залиш порожніми — тексти скопіюються без змін.
                </p>
              </div>
            </div>

            {(() => {
              const uriUnchanged = !addUriInput.trim() || addUriInput.trim() === (baseVariant.uri ?? "").trim();
              const canSubmit = !addingColor && !!addPcodeInput.trim() && !uriUnchanged;
              return (
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={handleAddColor}
                disabled={!canSubmit}
                style={{
                  flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontSize: 13.5, padding: "10px 0", borderRadius: 8,
                  border: "none", background: "#6366f1", color: "#fff", fontWeight: 600,
                  cursor: !canSubmit ? "not-allowed" : "pointer",
                  opacity: !canSubmit ? 0.5 : 1,
                }}
              >
                {addingColor && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
                {addingColor ? "Створюємо..." : "Створити та додати"}
              </button>
              <button
                type="button"
                onClick={closeAddModal}
                style={{
                  fontSize: 13, padding: "10px 20px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Скасувати
              </button>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Confirm dialog ────────────────────────────────────────── */}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          subMessage={confirmState.subMessage}
          destructive={confirmState.destructive}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

// ─── Photos section ───────────────────────────────────────────────────────────

function PhotosSection({
  productId,
  photos,
  setPhotos,
}: {
  productId: number;
  photos: any[];
  setPhotos: (fn: ((prev: any[]) => any[]) | any[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [confirmPhoto, setConfirmPhoto] = useState<{ photoId: number } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      fd.append("gallery", "1");
      const res = await fetch(`/api/products/${productId}/photos`, { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || "Помилка завантаження фото"); return; }
      const created: any[] = Array.isArray(body) ? body.filter(Boolean) : [];
      setPhotos((p: any[]) => [...p, ...created]);
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setUploading(false);
    }
  }

  async function doDeletePhoto(photoId: number) {
    await fetch(`/api/products/${productId}/photos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId, gallery: false }),
    });
    setPhotos((p: any[]) => p.filter((x: any) => x.id !== photoId));
  }

  return (
    <>
    <div className="space-y-6">
      {/* Галерея — products_photos / папка "products" */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Галерея (додаткові фото)</p>
        <div className="flex flex-wrap gap-3 mb-3">
          {photos.map((p: any) => (
            <div key={p.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getImgUrl(p.img, "products")} alt="" className="h-24 w-24 rounded-md object-cover border" />
              <button onClick={() => setConfirmPhoto({ photoId: p.id })}
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <label className="cursor-pointer">
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button variant="outline" size="sm" disabled={uploading} asChild>
            <span>{uploading ? "Завантаження..." : "Додати до галереї"}</span>
          </Button>
        </label>
      </div>
    </div>

    {confirmPhoto && (
      <ConfirmDialog
        message="Видалити фото?"
        subMessage="Фото буде видалено з сервера. Цю дію не можна відмінити."
        destructive
        confirmLabel="Видалити"
        onConfirm={() => doDeletePhoto(confirmPhoto.photoId)}
        onCancel={() => setConfirmPhoto(null)}
      />
    )}
    </>
  );
}

// ─── CREATE FORM ─────────────────────────────────────────────────────────────

function CreateForm({ categories, measures, filters, langs, product }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("main");

  const [form, setForm] = useState({
    title: product?.title ?? "",
    main_title: product?.main_title ?? "",
    pcode: product?.pcode ?? "",
    uri: product?.uri ?? "",
    price: product?.price ?? 0,
    price_sale: product?.price_sale ?? "",
    price2: product?.price2 ?? "",
    price2n: product?.price2n ?? "",
    price3: product?.price3 ?? "",
    price3n: product?.price3n ?? "",
    minquantity: product?.minquantity ?? 1,
    measure: product?.measure ? String(product.measure) : "0",
    active: product?.active ?? 1,
    package: product?.package ?? 1,
    labelAction: product?.labelAction ?? 0,
    popular: product?.popular ?? 0,
    priority: product?.priority ?? 0,
    descr: product?.descr ?? "",
    heading: product?.heading ?? "",
    text: product?.text ?? "",
    seoTitle: product?.seoTitle ?? "",
    seoKey: product?.seoKey ?? "",
    seoDescr: product?.seoDescr ?? "",
    lang: product?.lang ?? langs[0]?.code ?? "uk",
  });

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<number[]>([]);
  const [cascadeMain, setCascadeMain] = useState("0");
  const [cascadeSub, setCascadeSub] = useState("0");
  const [cascadeType, setCascadeType] = useState("0");
  const [chars, setChars] = useState<{ title: string; value: string }[]>([]);

  const mainCats = categories.filter((c: any) => c.pid === 0);
  const subCats = cascadeMain !== "0"
    ? (() => { const m = categories.find((x: any) => x.id === parseInt(cascadeMain)); return m ? categories.filter((c: any) => c.pid === m.translationId) : []; })()
    : [];
  const typeCats = cascadeSub !== "0"
    ? (() => { const s = categories.find((x: any) => x.id === parseInt(cascadeSub)); return s ? categories.filter((c: any) => c.pid === s.translationId) : []; })()
    : [];

  function getCategoryPath(catId: number): string {
    const cat = categories.find((c: any) => c.id === catId);
    if (!cat) return `#${catId}`;
    if (cat.pid === 0) return cat.title;
    const parent = categories.find((c: any) => c.translationId === cat.pid);
    if (!parent || parent.pid === 0) return `${parent?.title ?? "?"} › ${cat.title}`;
    const grand = categories.find((c: any) => c.translationId === parent.pid);
    return `${grand?.title ?? "?"} › ${parent.title} › ${cat.title}`;
  }

  function addCascadeCategory() {
    const idStr = cascadeType !== "0" ? cascadeType : cascadeSub !== "0" ? cascadeSub : cascadeMain;
    const id = parseInt(idStr);
    if (!id || selectedCategories.includes(id)) return;
    setSelectedCategories((p) => [...p, id]);
  }

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, main_title: form.main_title, pcode: form.pcode, uri: form.uri,
          heading: form.heading, text: form.text, descr: form.descr, lang: form.lang,
          price: parseFloat(String(form.price)) || 0,
          price_sale: form.price_sale !== "" ? parseFloat(String(form.price_sale)) : 0,
          price2: form.price2 !== "" ? parseFloat(String(form.price2)) : 0,
          price2n: form.price2n !== "" ? parseInt(String(form.price2n)) : 0,
          price3: form.price3 !== "" ? parseFloat(String(form.price3)) : 0,
          price3n: form.price3n !== "" ? parseInt(String(form.price3n)) : 0,
          measure: form.measure !== "0" ? String(parseInt(form.measure)) : "",
          minquantity: parseInt(String(form.minquantity)) || 0,
          priority: parseInt(String(form.priority)) || 0,
          active: parseInt(String(form.active)),
          package: parseInt(String(form.package)),
          label_action: parseInt(String(form.labelAction)),
          popular: parseInt(String(form.popular)),
          seo_title: form.seoTitle, seo_key: form.seoKey, seo_descr: form.seoDescr,
          categoryIds: selectedCategories, filterIds: selectedFilters,
        }),
      });
      const saved = await res.json();
      toast.success("Товар створено!");
      router.push(`/products/${saved.id}`);
    } catch {
      toast.error("Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "main", label: "Основне" },
    { id: "prices", label: "Ціни" },
    { id: "categories", label: "Категорії" },
    { id: "chars", label: "Характеристики" },
    { id: "seo", label: "SEO" },
  ];

  return (
    <div className="p-6">
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "main" && (
        <div className="grid gap-6 max-w-3xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Назва *</Label><Input value={form.title} onChange={(e) => { set("title", e.target.value); set("uri", transliterate(e.target.value)); }} /></div>
            <div className="space-y-1.5"><Label>Заголовок (H1)</Label><Input value={form.main_title} onChange={(e) => set("main_title", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Артикул</Label><Input value={form.pcode} onChange={(e) => set("pcode", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>URI (slug)</Label><Input value={form.uri} onChange={(e) => set("uri", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Мінімальна кількість</Label><Input type="number" value={form.minquantity} onChange={(e) => set("minquantity", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Пріоритет</Label><Input type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>В наявності</Label>
              <Select value={String(form.package)} onValueChange={(v) => set("package", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {measures.map((m: any) => (
                    <SelectItem key={m.translationId ?? m.translation_id} value={String(m.translationId ?? m.translation_id)}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Акційний</Label>
              <Select value={String(form.labelAction)} onValueChange={(v) => set("labelAction", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">Ні</SelectItem><SelectItem value="1">Так</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Популярний</Label>
              <Select value={String(form.popular)} onValueChange={(v) => set("popular", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">Ні</SelectItem><SelectItem value="1">Так</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Короткий опис</Label>
            <RichTextEditor value={form.descr} onChange={(v) => set("descr", v)} rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Повний опис</Label>
            <RichTextEditor value={form.text} onChange={(v) => set("text", v)} rows={8} />
          </div>
        </div>
      )}

      {activeTab === "prices" && (
        <div className="grid gap-4 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Ціна $ *</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Акційна ціна</Label><Input type="number" step="0.01" value={form.price_sale} onChange={(e) => set("price_sale", e.target.value)} placeholder="Залишити порожнім" /></div>
          </div>
          <div className="border rounded-md p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Оптові ціни</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Ціна 2</Label><Input type="number" step="0.01" value={form.price2} onChange={(e) => set("price2", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Від (кількість)</Label><Input type="number" value={form.price2n} onChange={(e) => set("price2n", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Ціна 3</Label><Input type="number" step="0.01" value={form.price3} onChange={(e) => set("price3", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Від (кількість)</Label><Input type="number" value={form.price3n} onChange={(e) => set("price3n", e.target.value)} /></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <div className="max-w-2xl space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Основна категорія</Label>
              <Select value={cascadeMain} onValueChange={(v) => { setCascadeMain(v); setCascadeSub("0"); setCascadeType("0"); }}>
                <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
                <SelectContent><SelectItem value="0">— Оберіть —</SelectItem>{mainCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Підкатегорія</Label>
              <Select value={cascadeSub} onValueChange={(v) => { setCascadeSub(v); setCascadeType("0"); }} disabled={subCats.length === 0}>
                <SelectTrigger><SelectValue placeholder={subCats.length === 0 ? "—" : "Оберіть..."} /></SelectTrigger>
                <SelectContent><SelectItem value="0">— Оберіть —</SelectItem>{subCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={cascadeType} onValueChange={setCascadeType} disabled={typeCats.length === 0}>
                <SelectTrigger><SelectValue placeholder={typeCats.length === 0 ? "—" : "Оберіть..."} /></SelectTrigger>
                <SelectContent><SelectItem value="0">— Оберіть —</SelectItem>{typeCats.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addCascadeCategory} disabled={cascadeMain === "0"}>
            <Plus className="h-4 w-4 mr-1" />Додати до категорій
          </Button>
          {selectedCategories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Обрано</p>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((catId) => (
                  <div key={catId} className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1 text-sm">
                    <span>{getCategoryPath(catId)}</span>
                    <button type="button" onClick={() => setSelectedCategories((p) => p.filter((x) => x !== catId))} className="text-gray-400 hover:text-red-500 ml-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "filters" && (
        <div className="max-w-2xl space-y-4">
          {filters.map((filter: any) => (
            <div key={filter.id} className="border rounded-md overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 font-medium text-sm">{filter.title}</div>
              <div className="p-3 flex flex-wrap gap-2">
                {filter.filters.map((ff: any) => (
                  <label key={ff.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedFilters.includes(ff.id)} onChange={(e) => setSelectedFilters((p) => e.target.checked ? [...p, ff.id] : p.filter((x) => x !== ff.id))} className="h-4 w-4 rounded border-gray-300" />
                    {ff.title}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "chars" && (
        <div className="max-w-xl space-y-3">
          <div className="space-y-2">
            {chars.map((char, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input placeholder="Характеристика" value={char.title} onChange={(e) => setChars((p) => p.map((c, j) => j === i ? { ...c, title: e.target.value } : c))} className="w-48" />
                <Input placeholder="Значення" value={char.value} onChange={(e) => setChars((p) => p.map((c, j) => j === i ? { ...c, value: e.target.value } : c))} />
                <button onClick={() => setChars((p) => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 shrink-0"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setChars((p) => [...p, { title: "", value: "" }])}>
            <Plus className="h-4 w-4 mr-1" />Додати характеристику
          </Button>
        </div>
      )}

      {activeTab === "seo" && (
        <div className="grid gap-4 max-w-2xl">
          <div className="space-y-1.5"><Label>SEO заголовок</Label><Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SEO ключові слова</Label><Textarea rows={2} value={form.seoKey} onChange={(e) => set("seoKey", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SEO опис</Label><Textarea rows={3} value={form.seoDescr} onChange={(e) => set("seoDescr", e.target.value)} /></div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Створити товар
        </Button>
        <Button variant="outline" onClick={() => router.push("/products")}>Скасувати</Button>
      </div>
    </div>
  );
}
