import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Lock,
  Coffee,
  Utensils,
  Receipt,
  CheckSquare,
  ShieldCheck,
  Sparkles,
  Users,
  HeartHandshake,
  ArrowRight,
  Clock,
  AlertTriangle,
  Moon,
  Calendar,
  Target,
  Cake,
  CloudRain,
  Snowflake,
  Sun,
  Package,
  Mail,
  Coins,
  Archive,
  Sparkles as SparklesIcon,
  ShoppingBag,
  RotateCw,
  Trash2,
  ImagePlus,
} from 'lucide-react';
import type { ExpenseCategory, SavingsGoal } from '../../types/index.ts';
import type {
  CustomWallFrameConfig,
  HomeShopState,
  ShopItemId,
  WallFramePreset,
} from '../../features/home/homeShopAndLayout.ts';
import { SHOP_CATALOG } from '../../features/home/homeShopAndLayout.ts';
import type {
  ApartmentTierOverride,
  DailyWrapUpStats,
  DoomscrollJarState,
  DoorstepDeliveriesState,
  ExamCountdownSummary,
  HomeUnlocksSummary,
  PetSpecies,
  RoomCleanlinessState,
  SeasonOverrideMode,
  TimeCapsuleChestState,
  VisitorHomeTarget,
} from '../../features/home/homeFeaturesEngine.ts';

/* ------------------------------------------------------------------ *
 * 1. Wall Clock & Corkboard Popup -> Today's Due/Overdue Tasks & Bills
 * ------------------------------------------------------------------ */
export const WallSchedulePopup: React.FC<{
  cleanliness: RoomCleanlinessState;
  onClose: () => void;
  onNavigateTasks: () => void;
  onNavigateBills: () => void;
}> = ({ cleanliness, onClose, onNavigateTasks, onNavigateBills }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Wall Corkboard · Due Tasks & Bills</h3>
              <p className="text-[11px] text-slate-300/75">
                {cleanliness.isNeatAndBright
                  ? 'Desk is spotless & bright — 0 overdue tasks or unpaid bills!'
                  : `Desk Clutter Level ${cleanliness.clutterLevel}/3 · Clear overdue/unpaid items to tidy desk`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close schedule popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Tasks Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" />
                Tasks Due & Overdue ({cleanliness.overdueTasksCount} overdue · {cleanliness.dueTodayTasksCount} today)
              </span>
              <button
                type="button"
                onClick={onNavigateTasks}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
              >
                Open Tasks <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {cleanliness.actionableTasks.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                No overdue or pending today tasks.
              </div>
            ) : (
              <div className="space-y-1.5">
                {cleanliness.actionableTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          t.isOverdue ? 'bg-rose-500/25 text-rose-200' : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {t.isOverdue ? 'Overdue' : 'Today'}
                      </span>
                      <span className="truncate text-slate-100 font-medium">{t.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{t.dueDate || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bills Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Unpaid & Overdue Bills ({cleanliness.unpaidBillsCount})
              </span>
              <button
                type="button"
                onClick={onNavigateBills}
                className="text-xs font-medium text-amber-300 hover:text-amber-200 flex items-center gap-1"
              >
                Open Bills <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {cleanliness.actionableBills.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                All upcoming bills settled!
              </div>
            ) : (
              <div className="space-y-1.5">
                {cleanliness.actionableBills.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {b.isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      <span className="truncate text-slate-100 font-medium">{b.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-semibold text-amber-200">
                        ₹{Math.round(b.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-400">{b.dueDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Kitchen & Dining Popup -> Break Timer OR Quick Food/Coffee Expense
 * ------------------------------------------------------------------ */
export const KitchenDiningPopup: React.FC<{
  categories: ExpenseCategory[];
  onStartBreak: (minutes: number) => void;
  onLogQuickExpense: (payload: {
    description: string;
    amountRupees: number;
    categoryId: string;
    paymentMethod: 'upi_bank' | 'cash' | 'credit_card' | 'debit_card';
  }) => Promise<void>;
  onClose: () => void;
}> = ({ categories, onStartBreak, onLogQuickExpense, onClose }) => {
  const defaultFoodCategory =
    categories.find((c) => /food|dining|coffee|grocery|snack/i.test(c.name))?.id ||
    categories[0]?.id ||
    'cat_food';

  const [description, setDescription] = useState('Coffee & Snack');
  const [amountStr, setAmountStr] = useState('120');
  const [categoryId, setCategoryId] = useState(defaultFoodCategory);
  const [paymentMethod, setPaymentMethod] = useState<'upi_bank' | 'cash' | 'credit_card' | 'debit_card'>('upi_bank');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amountStr);
    if (!Number.isFinite(val) || val <= 0) return;
    setSubmitting(true);
    try {
      await onLogQuickExpense({
        description: description.trim() || 'Quick Kitchen Expense',
        amountRupees: val,
        categoryId,
        paymentMethod,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Kitchen & Dining Counter</h3>
              <p className="text-[11px] text-slate-300/75">Recharge Energy/Mood or log a quick meal expense</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close kitchen popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Break Timer Shortcuts */}
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-200 mb-2.5">
              <Coffee className="w-3.5 h-3.5" />
              Start a Recharge Break Timer
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onStartBreak(5);
                  onClose();
                }}
                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
              >
                ☕ 5m Coffee Break
              </button>
              <button
                type="button"
                onClick={() => {
                  onStartBreak(15);
                  onClose();
                }}
                className="px-3 py-2 rounded-lg bg-slate-900/70 hover:bg-slate-800 border border-amber-300/30 text-amber-100 font-semibold text-xs transition-colors"
              >
                🍽️ 15m Meal Break
              </button>
            </div>
          </div>

          {/* Quick Expense Logger */}
          <form onSubmit={handleSubmit} className="space-y-3 border-t border-white/10 pt-4">
            <div className="text-xs font-semibold text-slate-200">Quick Log Food / Dining Expense</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[50, 120, 250, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmountStr(String(amt))}
                  className={`py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                    amountStr === String(amt)
                      ? 'bg-indigo-500/35 border-indigo-400/60 text-white'
                      : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                className="col-span-2 rounded-lg bg-slate-950/70 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
              <input
                type="number"
                min={1}
                step="1"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="₹"
                className="rounded-lg bg-slate-950/70 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-lg bg-slate-950/70 border border-white/15 px-2.5 py-2 text-xs text-white focus:outline-none"
              >
                {categories.length === 0 ? (
                  <option value="cat_food">Food & Dining</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'upi_bank' | 'cash' | 'credit_card' | 'debit_card')
                }
                className="rounded-lg bg-slate-950/70 border border-white/15 px-2.5 py-2 text-xs text-white focus:outline-none"
              >
                <option value="upi_bank">UPI / Bank</option>
                <option value="cash">Cash</option>
                <option value="debit_card">Debit Card</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              {submitting ? 'Logging...' : `Log ₹${amountStr || 0} Expense`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 3. XP & Savings Upgrades + Pet Progress Drawer
 * ------------------------------------------------------------------ */
export const UpgradesAndPetModal: React.FC<{
  unlocksSummary: HomeUnlocksSummary;
  petSpecies: PetSpecies;
  onChangePetSpecies?: (species: PetSpecies) => void;
  apartmentTierOverride?: ApartmentTierOverride;
  onChangeApartmentTierOverride?: (tier: ApartmentTierOverride) => void;
  isVisiting: boolean;
  onClose: () => void;
}> = ({
  unlocksSummary,
  petSpecies,
  onChangePetSpecies,
  apartmentTierOverride = 'auto',
  onChangeApartmentTierOverride,
  isVisiting,
  onClose,
}) => {
  const rows = [
    {
      key: 'mechKeyboard',
      title: 'Mechanical RGB Keyboard & Desk Mat',
      requirement: '200 XP or Level 2',
      unlocked: unlocksSummary.unlocks.mechKeyboard,
    },
    {
      key: 'dualMonitor',
      title: 'Dual Widescreen Studio Monitor',
      requirement: 'Level 2 or 25% Savings Goal',
      unlocked: unlocksSummary.unlocks.dualMonitor,
    },
    {
      key: 'extraPlants',
      title: 'Monstera Pot & Hanging Window Pothos',
      requirement: 'Level 2, 25% Savings, or 5d Streak',
      unlocked: unlocksSummary.unlocks.extraPlants,
    },
    {
      key: 'fairyLights',
      title: 'Warm Fairy String Lights',
      requirement: 'Level 3, 50% Savings, or 7d Streak',
      unlocked: unlocksSummary.unlocks.fairyLights,
    },
    {
      key: 'espressoUpgrade',
      title: 'Brushed Chrome Barista Espresso Bar',
      requirement: 'Level 4 or 50% Savings Goal',
      unlocked: unlocksSummary.unlocks.espressoUpgrade,
    },
    {
      key: 'gamingChair',
      title: 'Pro Ergo Racing Study Chair',
      requirement: 'Level 5 or 100% Savings Goal',
      unlocked: unlocksSummary.unlocks.gamingChair,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Apartment Upgrades ({unlocksSummary.unlockedCount}/{unlocksSummary.totalDecorCount}) & Pet
              </h3>
              <p className="text-[11px] text-slate-300/75">
                Level {unlocksSummary.level} ({unlocksSummary.totalXP.toLocaleString()} XP)
                {!isVisiting && ` · Peak Savings Goal: ${unlocksSummary.bestSavingsPct}%`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close upgrades modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Streak Pet Section */}
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-amber-200">
                  🐾 Streak Companion · {unlocksSummary.pet.tierLabel}
                </div>
                <div className="text-[11px] text-slate-300/80">
                  Sleeps on the rug during study/sleep & follows you on kitchen/dining breaks.
                </div>
              </div>
              {!isVisiting && onChangePetSpecies && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangePetSpecies('cat')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                      petSpecies === 'cat'
                        ? 'bg-amber-500/30 border-amber-300/50 text-amber-100'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    🐈 Cat
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangePetSpecies('dog')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                      petSpecies === 'dog'
                        ? 'bg-amber-500/30 border-amber-300/50 text-amber-100'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    🐕 Shiba
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div
                className={`rounded-lg px-2.5 py-1.5 border flex items-center gap-1.5 ${
                  unlocksSummary.pet.hasCollar
                    ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-400'
                }`}
              >
                {unlocksSummary.pet.hasCollar ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                7d Streak: Gold Bell Collar
              </div>
              <div
                className={`rounded-lg px-2.5 py-1.5 border flex items-center gap-1.5 ${
                  unlocksSummary.pet.hasLuxuryPetBed
                    ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-400'
                }`}
              >
                {unlocksSummary.pet.hasLuxuryPetBed ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                30d Streak: Royal Velvet Bed
              </div>
            </div>
          </div>

          {/* 3D Furniture Upgrades List */}
          <div className="space-y-2">
            {rows.map((item) => (
              <div
                key={item.key}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
                  item.unlocked
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-slate-100'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.unlocked ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="font-medium">{item.title}</span>
                </div>
                <span className="text-[11px] opacity-80 shrink-0 ml-2">{item.requirement}</span>
              </div>
            ))}
          </div>

          {!isVisiting && onChangeApartmentTierOverride && (
            <ApartmentTierControlCard
              level={unlocksSummary.level}
              override={apartmentTierOverride}
              onChangeOverride={onChangeApartmentTierOverride}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 4. Privacy-Safe Visit Squad / Partner Home Modal
 * ------------------------------------------------------------------ */
export const VisitHomeModal: React.FC<{
  visitors: VisitorHomeTarget[];
  loading: boolean;
  activeVisitorUid: string | null;
  onSelectVisitor: (visitor: VisitorHomeTarget) => void;
  onReturnHome: () => void;
  onClose: () => void;
}> = ({ visitors, loading, activeVisitorUid, onSelectVisitor, onReturnHome, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Visit Squad or Partner Home</h3>
              <p className="text-[11px] text-slate-300/75">Explore live study status, decor unlocks & streak pet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close visit home modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-[11px] text-emerald-100 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Privacy-Safe Read-Only Mode: Only public study status, streak pet, and XP decor level are visible. Financial balances, bills, and private tasks are never shared.
            </span>
          </div>

          {activeVisitorUid && (
            <button
              type="button"
              onClick={() => {
                onReturnHome();
                onClose();
              }}
              className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-xs font-semibold transition-colors"
            >
              Return to My Own Apartment
            </button>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading Squad & Joint Vault partners...</div>
          ) : visitors.length === 0 ? (
            <div className="py-6 text-center space-y-1.5">
              <p className="text-xs font-medium text-slate-300">No Squad members or Joint Vault partners found yet.</p>
              <p className="text-[11px] text-slate-400">
                Join a Study Squad in Focus Hub or invite a partner in Joint Vaults to visit their 3D home.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visitors.map((v) => {
                const isSelected = activeVisitorUid === v.uid;
                return (
                  <button
                    key={v.uid}
                    type="button"
                    onClick={() => {
                      onSelectVisitor(v);
                      onClose();
                    }}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate">{v.displayName}</span>
                        {v.isStudyingLive ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-[10px] text-emerald-200">
                            Live Studying
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-700/60 text-[10px] text-slate-300">
                            Chilling
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-300/75 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          {v.source === 'joint_vault_partner' && <HeartHandshake className="w-3 h-3 text-rose-300" />}
                          {v.sourceLabel}
                        </span>
                        <span>· {v.streakDays}d streak</span>
                        <span>· {v.petSpecies === 'cat' ? '🐈' : '🐕'}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 5. 1-Click "End Day" Sleep Ritual & Daily Wrap-Up Modal
 * ------------------------------------------------------------------ */
export const EndDaySleepModal: React.FC<{
  stats: DailyWrapUpStats;
  onConfirmSleep: () => void;
  onWalkOnly: () => void;
  onClose: () => void;
}> = ({ stats, onConfirmSleep, onWalkOnly, onClose }) => {
  const focusHrs = Math.floor(stats.focusMinutesToday / 60);
  const focusRemMin = stats.focusMinutesToday % 60;
  const focusFormatted = focusHrs > 0 ? `${focusHrs}h ${focusRemMin}m` : `${focusRemMin}m`;
  const spentRupees = Math.round(stats.spentPaiseToday / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-400/25 bg-[#091129]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/25 border border-indigo-400/40 flex items-center justify-center">
              <Moon className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">End Day · Sleep Ritual Wrap-Up</h3>
              <p className="text-[11px] text-slate-300/75">Review today’s Focus, Spending & Habits before bed</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close end day modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[11px] text-slate-400">Today’s Focus</div>
              <div className="text-lg font-bold text-indigo-300 mt-0.5">{focusFormatted}</div>
              <div className="text-[10px] text-slate-400">{stats.tasksCompletedToday} tasks completed</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[11px] text-slate-400">Today’s Spend</div>
              <div className="text-lg font-bold text-amber-300 mt-0.5">
                ₹{spentRupees.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400">Logged expenses today</div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 flex items-center justify-between text-xs">
            <span className="text-emerald-200 font-medium">Habits Completed Today</span>
            <span className="font-bold text-emerald-300">
              {stats.habitsDoneToday} / {stats.habitsTotalToday}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onConfirmSleep();
                onClose();
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
            >
              <Moon className="w-3.5 h-3.5" />
              Confirm End Day & Sleep
            </button>
            <button
              type="button"
              onClick={() => {
                onWalkOnly();
                onClose();
              }}
              className="py-2.5 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium transition"
            >
              Just Rest on Bed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 6. Exam Countdown, Daily Target, Season & Birthday Config Modal
 * ------------------------------------------------------------------ */
export const ExamAndSeasonModal: React.FC<{
  examSummary: ExamCountdownSummary;
  todayStr: string;
  birthDate?: string | null;
  seasonOverride: SeasonOverrideMode;
  customExamTitle: string;
  customExamDate: string;
  onSaveCustomExam: (title: string, examDate: string) => void;
  onSaveBirthDate: (birthDate: string) => Promise<void>;
  onChangeSeasonOverride: (mode: SeasonOverrideMode) => void;
  onReplayMorningSequence: () => void;
  onOpenStudyExams: () => void;
  onClose: () => void;
}> = ({
  examSummary,
  todayStr,
  birthDate,
  seasonOverride,
  customExamTitle,
  customExamDate,
  onSaveCustomExam,
  onSaveBirthDate,
  onChangeSeasonOverride,
  onReplayMorningSequence,
  onOpenStudyExams,
  onClose,
}) => {
  const [titleInput, setTitleInput] = useState(customExamTitle || examSummary.examTitle || '');
  const [dateInput, setDateInput] = useState(customExamDate || examSummary.examDate || '');
  const [bdayInput, setBdayInput] = useState(birthDate || '');
  const [savingBday, setSavingBday] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-500/20 border border-sky-400/35 flex items-center justify-center">
              <Target className="w-4.5 h-4.5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Exam Frame, Seasons & Birthday</h3>
              <p className="text-[11px] text-slate-300/75">Customize wall frame, seasonal props & special days</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close exam and season modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Exam Countdown Editor */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Wall Frame Exam Countdown
              </span>
              <button
                type="button"
                onClick={() => {
                  onOpenStudyExams();
                  onClose();
                }}
                className="text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
              >
                Open Study OS →
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="e.g. Sem 3 Exam"
                className="col-span-2 rounded-lg bg-slate-950/70 border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
              <input
                type="date"
                value={dateInput}
                min={todayStr}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded-lg bg-slate-950/70 border border-white/15 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
            </div>
            <button
              type="button"
              onClick={() => onSaveCustomExam(titleInput, dateInput)}
              className="w-full py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-semibold transition"
            >
              Update Wall Countdown Frame
            </button>
          </div>

          {/* Season Switch / Preview */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2">
            <div className="text-xs font-semibold text-sky-200">Calendar Season Atmosphere</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'auto', label: 'Auto', icon: Calendar },
                  { id: 'monsoon', label: 'Monsoon', icon: CloudRain },
                  { id: 'winter', label: 'Winter', icon: Snowflake },
                  { id: 'spring_clear', label: 'Clear', icon: Sun },
                ] as const
              ).map((s) => {
                const Icon = s.icon;
                const active = seasonOverride === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChangeSeasonOverride(s.id)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition ${
                      active
                        ? 'bg-sky-500/35 border-sky-400/60 text-white'
                        : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400">
              Monsoon adds window rain + hot chai mug · Winter adds cozy fairy lights + falling snow.
            </p>
          </div>

          {/* Birthday & Morning Sequence Replay */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-200 flex items-center gap-1.5">
                <Cake className="w-3.5 h-3.5" />
                Birthday Cake Celebration Date
              </span>
              <button
                type="button"
                onClick={() => setBdayInput(todayStr)}
                className="text-[10px] text-pink-300 hover:text-pink-200 underline"
              >
                Test Today
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={bdayInput}
                onChange={(e) => setBdayInput(e.target.value)}
                className="flex-1 rounded-lg bg-slate-950/70 border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                disabled={savingBday}
                onClick={async () => {
                  setSavingBday(true);
                  try {
                    await onSaveBirthDate(bdayInput);
                  } finally {
                    setSavingBday(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-pink-500/80 hover:bg-pink-500 text-white text-xs font-semibold transition"
              >
                {savingBday ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onReplayMorningSequence();
              onClose();
            }}
            className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-xs font-semibold transition"
          >
            ☀️ Play 10-Second Morning Awakening Sequence
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 7. Doorstep Parcel & Bill Mail Modal
 * ------------------------------------------------------------------ */
export const DoorstepParcelMailModal: React.FC<{
  state: DoorstepDeliveriesState;
  onNavigateTransactions: () => void;
  onNavigateBills: () => void;
  onClose: () => void;
}> = ({ state, onNavigateTransactions, onNavigateBills, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center">
              <Package className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Doorstep Parcels & Bill Mail</h3>
              <p className="text-[11px] text-slate-300/75">Recent shopping deliveries & pending red-ribbon bills</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
            aria-label="Close parcels modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Shopping / Gadget Parcels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Recent Shopping / Gadget Parcels ({state.parcelCount})
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigateTransactions();
                  onClose();
                }}
                className="text-[11px] text-amber-300 hover:text-amber-200 font-medium"
              >
                Transactions →
              </button>
            </div>
            {state.recentShoppingParcels.length === 0 ? (
              <p className="text-xs text-slate-400 bg-white/[0.03] rounded-xl px-3 py-2 border border-white/10">
                No recent shopping or gadget orders in the past 14 days.
              </p>
            ) : (
              <div className="space-y-1.5">
                {state.recentShoppingParcels.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-slate-100">{p.description}</span>
                    <div className="shrink-0 ml-2 flex items-center gap-2">
                      <span className="font-semibold text-amber-300">
                        ₹{Math.round(p.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-400">{p.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Bill Envelopes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-rose-200 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Red-Ribbon Bill Mail ({state.mailCount})
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigateBills();
                  onClose();
                }}
                className="text-[11px] text-rose-300 hover:text-rose-200 font-medium"
              >
                Pay Bills →
              </button>
            </div>
            {state.upcomingBills.length === 0 ? (
              <p className="text-xs text-emerald-200 bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-400/20">
                Zero unpaid bills waiting at your doorstep!
              </p>
            ) : (
              <div className="space-y-1.5">
                {state.upcomingBills.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-slate-100">{b.name}</span>
                    <div className="shrink-0 ml-2 flex items-center gap-2">
                      <span className="font-semibold text-rose-200">
                        ₹{Math.round(b.amountPaise / 100).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-300">{b.dueDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 8. Doomscroll Self-Tax Jar & Time Capsule / Expansion Quick Modals
 * ------------------------------------------------------------------ */
export const DoomscrollJarModal: React.FC<{
  state: DoomscrollJarState;
  savingsGoals: SavingsGoal[];
  onClearJarToGoal?: () => Promise<void>;
  onOpenFullTaxJar: () => void;
  onClose: () => void;
}> = ({ state, savingsGoals, onClearJarToGoal, onOpenFullTaxJar, onClose }) => {
  const [sweeping, setSweeping] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center">
              <Coins className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">3D Doomscroll Self-Tax Jar</h3>
              <p className="text-[11px] text-slate-300/75">Accountability jar linked to your Savings Goals</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-amber-200/80">Coins Inside Jar</div>
              <div className="text-2xl font-bold text-amber-300">₹{state.totalTaxAmount.toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {state.entryCount} logs · {state.totalMinutes} doomscroll minutes
              </div>
            </div>
            <div className="text-3xl">{state.isEmpty ? '✨🫙' : '🪙🫙'}</div>
          </div>

          <div className="flex flex-col gap-2">
            {!state.isEmpty && onClearJarToGoal && (
              <button
                type="button"
                disabled={sweeping}
                onClick={async () => {
                  setSweeping(true);
                  try {
                    await onClearJarToGoal();
                    onClose();
                  } finally {
                    setSweeping(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition"
              >
                {sweeping
                  ? 'Transferring...'
                  : savingsGoals[0]
                    ? `✨ Sweep ₹${state.totalTaxAmount} to "${savingsGoals[0].title}" & Empty Jar`
                    : `✨ Mark ₹${state.totalTaxAmount} Swept & Empty Jar`}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onOpenFullTaxJar();
                onClose();
              }}
              className="w-full py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition"
            >
              Open Full Doomscroll Tax Jar Tool →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TimeCapsuleQuickModal: React.FC<{
  state: TimeCapsuleChestState;
  onOpenCapsule: (capsuleId: string) => Promise<void>;
  onOpenFullCapsules: () => void;
  onClose: () => void;
}> = ({ state, onOpenCapsule, onOpenFullCapsules, onClose }) => {
  const [openingId, setOpeningId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-400/35 flex items-center justify-center">
              <Archive className="w-4.5 h-4.5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Future Self Time Capsule Chest</h3>
              <p className="text-[11px] text-slate-300/75">
                {state.readyCount} ready to unseal · {state.lockedCount} sealed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {state.readyCapsules.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-emerald-300">✨ Ready to Unlock Today!</div>
              {state.readyCapsules.map((cap) => (
                <div
                  key={cap.id}
                  className="rounded-xl border border-emerald-400/35 bg-emerald-500/12 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{cap.title}</div>
                    <div className="text-[10px] text-emerald-200/80">Unlock Date: {cap.unlockDate}</div>
                  </div>
                  <button
                    type="button"
                    disabled={openingId === cap.id}
                    onClick={async () => {
                      setOpeningId(cap.id);
                      try {
                        await onOpenCapsule(cap.id);
                      } finally {
                        setOpeningId(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-semibold shrink-0"
                  >
                    {openingId === cap.id ? 'Opening...' : 'Unseal'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {state.lockedCapsules.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">🔒 Sealed Capsules</div>
              {state.lockedCapsules.slice(0, 4).map((cap) => (
                <div
                  key={cap.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="truncate text-slate-200">{cap.title}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">Opens {cap.unlockDate}</span>
                </div>
              ))}
            </div>
          )}

          {state.totalCount === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">
              No Time Capsules written yet. Write a letter to your future self in Dashboard!
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenFullCapsules();
              onClose();
            }}
            className="w-full py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            Open Time Capsule Studio →
          </button>
        </div>
      </div>
    </div>
  );
};

export const ApartmentTierControlCard: React.FC<{
  level: number;
  override: ApartmentTierOverride;
  onChangeOverride: (tier: ApartmentTierOverride) => void;
}> = ({ level, override, onChangeOverride }) => (
  <div className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3.5 space-y-2 mt-3">
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-indigo-200 flex items-center gap-1.5">
        <SparklesIcon className="w-3.5 h-3.5" />
        Apartment Architecture Tier (Level {level})
      </span>
      <span className="text-[10px] text-slate-300">Lv10 Balcony · Lv20 Penthouse</span>
    </div>
    <div className="grid grid-cols-4 gap-1.5">
      {(
        [
          { id: 'auto', label: 'Auto (Lv)' },
          { id: 'studio', label: 'Studio' },
          { id: 'balcony', label: 'Lv10 Balcony' },
          { id: 'penthouse', label: 'Lv20 Loft' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChangeOverride(opt.id)}
          className={`py-1.5 px-1.5 rounded-lg text-[10px] font-medium border transition ${
            override === opt.id
              ? 'bg-indigo-500/40 border-indigo-300/60 text-white'
              : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ *
 * 9. 3D Room Furniture Shop & Layout Editor Modal
 * ------------------------------------------------------------------ */
export const FurnitureShopModal: React.FC<{
  shopState: HomeShopState;
  availableCoins: number;
  layoutEditMode: boolean;
  onBuyItem: (id: ShopItemId) => void;
  onTogglePlaceItem: (id: ShopItemId) => void;
  onRotateItem: (id: ShopItemId) => void;
  onRemoveItem: (id: ShopItemId) => void;
  onToggleLayoutEditMode: () => void;
  onClose: () => void;
}> = ({
  shopState,
  availableCoins,
  layoutEditMode,
  onBuyItem,
  onTogglePlaceItem,
  onRotateItem,
  onRemoveItem,
  onToggleLayoutEditMode,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center">
              <ShoppingBag className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">3D Furniture Shop & Layout Studio</h3>
              <p className="text-[11px] text-amber-200 font-semibold">
                🪙 {availableCoins.toLocaleString()} Focus Coins Available
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[72vh] overflow-y-auto">
          <div className="flex items-center justify-between rounded-xl border border-sky-400/25 bg-sky-500/10 px-3.5 py-2.5">
            <div className="text-xs text-sky-100">
              {layoutEditMode
                ? 'Grid Layout Editor Active — click floor grid in room to move selected item!'
                : 'Enable Grid Layout Mode to move & snap furniture on the 0.5m room grid.'}
            </div>
            <button
              type="button"
              onClick={() => {
                onToggleLayoutEditMode();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-semibold shrink-0 ml-2"
            >
              {layoutEditMode ? 'Done Editing' : '🛠️ Edit Grid'}
            </button>
          </div>

          <div className="space-y-2">
            {SHOP_CATALOG.map((item) => {
              const owned = shopState.ownedIds.includes(item.id);
              const placed = shopState.placedItems.some((p) => p.itemId === item.id);
              const canAfford = availableCoins >= item.priceCoins;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>{item.icon}</span>
                      <span>{item.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-300/75 truncate">{item.description}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!owned ? (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyItem(item.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        🪙 {item.priceCoins}
                      </button>
                    ) : placed ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onRotateItem(item.id)}
                          className="p-1.5 rounded-lg bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-400/35"
                          title="Rotate 90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/30"
                          title="Store in inventory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTogglePlaceItem(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-semibold"
                      >
                        Place in Room
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 10. Custom Wall Photo & Poster Frames Modal
 * ------------------------------------------------------------------ */
export const CustomWallFramesModal: React.FC<{
  frames: CustomWallFrameConfig[];
  onSaveFrame: (updated: CustomWallFrameConfig) => void;
  onClose: () => void;
}> = ({ frames, onSaveFrame, onClose }) => {
  const [selectedId, setSelectedId] = useState<'custom_frame_1' | 'custom_frame_2'>(
    frames[0]?.id || 'custom_frame_1'
  );
  const current = frames.find((f) => f.id === selectedId) || frames[0];

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 240;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 320, 240);
        const compressed = c.toDataURL('image/jpeg', 0.8);
        onSaveFrame({ ...current, preset: 'custom', imageDataUrl: compressed });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/20 border border-indigo-400/35 flex items-center justify-center">
              <ImagePlus className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Custom Wall Photo & Poster Frames</h3>
              <p className="text-[11px] text-slate-300/75">Upload your own vision board or pick a poster theme</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {current && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {frames.map((f, idx) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    selectedId === f.id
                      ? 'bg-indigo-500/35 border-indigo-400 text-white'
                      : 'bg-white/[0.04] border-white/10 text-slate-300'
                  }`}
                >
                  Frame #{idx + 1}: {f.title}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-300">Poster Caption</label>
              <input
                type="text"
                value={current.title}
                onChange={(e) => onSaveFrame({ ...current, title: e.target.value })}
                className="w-full rounded-lg bg-slate-950/70 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-300">Built-In Poster Presets</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'cyber_dusk', label: 'Cyber Dusk' },
                    { id: 'sakura_horizon', label: 'Sakura' },
                    { id: 'focus_grid', label: 'Focus Zen' },
                  ] as Array<{ id: WallFramePreset; label: string }>
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSaveFrame({ ...current, preset: p.id, imageDataUrl: null })}
                    className={`py-1.5 rounded-lg text-[11px] font-medium border ${
                      current.preset === p.id && !current.imageDataUrl
                        ? 'bg-sky-500/35 border-sky-400 text-white'
                        : 'bg-white/[0.04] border-white/10 text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold cursor-pointer transition">
              <ImagePlus className="w-4 h-4" />
              Upload Custom Photo / Poster
              <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

