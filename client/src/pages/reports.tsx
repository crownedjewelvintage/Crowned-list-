import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { downloadCsv } from "@/lib/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  PiggyBank,
  Users,
  Plus,
  Download,
  Settings as SettingsIcon,
  Trash2,
  Package2,
  CreditCard,
  BarChart3,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { BusinessSettings, Employee, Expense } from "@shared/schema";

interface ReportSummary {
  range: { from: string; to: string };
  settings: {
    commissionPct: number;
    paymentFeePct: number;
    paymentFeeFixed: number;
    monthlyInventoryBudget: number;
    monthlyPayrollBudget: number;
    monthlySavingsTarget: number;
  };
  totals: {
    revenue: number;
    commission: number;
    paymentFee: number;
    totalFees: number;
    cogs: number;
    grossProfit: number;
    orders: number;
    expensesTotal: number;
    netProfit: number;
  };
  expenseByCategory: Record<string, number>;
  monthly: Array<{
    month: string;
    revenue: number;
    fees: number;
    cogs: number;
    profit: number;
    expenses: number;
    net: number;
  }>;
  topItems: Array<{
    itemId: number;
    sku: string;
    title: string;
    units: number;
    revenue: number;
    profit: number;
  }>;
  budget: {
    currentMonth: string;
    monthInventorySpend: number;
    monthPayrollSpend: number;
    scheduledPayroll: number;
    inventoryBudgetRemaining: number;
    payrollBudgetRemaining: number;
    savingsTarget: number;
  };
  inventory: {
    activeCount: number;
    inventoryValue: number;
    inventoryRetailValue: number;
  };
}

const EXPENSE_CATEGORIES = [
  "inventory",
  "shipping",
  "payroll",
  "supplies",
  "software",
  "other",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  inventory: "hsl(var(--brand-emerald))",
  shipping: "hsl(var(--brand-gold))",
  payroll: "#8b5cf6",
  supplies: "#3b82f6",
  software: "#f97316",
  other: "#94a3b8",
};

function fmtMoney(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}
function fmtMoneyCompact(n: number) {
  const v = n || 0;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}
function formatMonthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  if (!y || !m) return yyyymm;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { toast } = useToast();

  // Default range: last 90 days
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(todayStr);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState<number | null>(null);

  const summaryKey = ["/api/reports/summary", fromDate, toDate] as const;
  const { data: summary, isLoading } = useQuery<ReportSummary>({
    queryKey: summaryKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/summary?from=${fromDate}&to=${toDate}`,
      );
      return res.json();
    },
  });
  const { data: settings } = useQuery<BusinessSettings>({
    queryKey: ["/api/settings"],
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  const exportCsv = async () => {
    try {
      await downloadCsv(
        `/api/reports/orders.csv?from=${fromDate}&to=${toDate}`,
        `crown-list-pnl-${fromDate}-to-${toDate}.csv`,
      );
      toast({ title: "Export complete" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const setQuickRange = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    setFromDate(d.toISOString().slice(0, 10));
    setToDate(todayStr());
  };
  const setThisMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(first.toISOString().slice(0, 10));
    setToDate(todayStr());
  };

  const expenseRows = useMemo(() => {
    return [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses]);

  const pieData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.expenseByCategory)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [summary]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2
              className="text-2xl sm:text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Business reports
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Revenue, fees, profit, expenses, and budget — all in one view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="button-open-settings"
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="gap-1.5"
            >
              <SettingsIcon className="size-4" />
              Settings
            </Button>
            <Button
              data-testid="button-export-pnl"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="gap-1.5"
            >
              <Download className="size-4" />
              Export P&amp;L
            </Button>
          </div>
        </div>

        {/* Date range */}
        <Card className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              data-testid="input-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-auto text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              data-testid="input-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-auto text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              data-testid="range-7"
              variant="ghost"
              size="sm"
              onClick={() => setQuickRange(7)}
              className="h-7 text-xs"
            >
              7d
            </Button>
            <Button
              data-testid="range-30"
              variant="ghost"
              size="sm"
              onClick={() => setQuickRange(30)}
              className="h-7 text-xs"
            >
              30d
            </Button>
            <Button
              data-testid="range-90"
              variant="ghost"
              size="sm"
              onClick={() => setQuickRange(90)}
              className="h-7 text-xs"
            >
              90d
            </Button>
            <Button
              data-testid="range-month"
              variant="ghost"
              size="sm"
              onClick={setThisMonth}
              className="h-7 text-xs"
            >
              This month
            </Button>
          </div>
        </Card>

        {isLoading || !summary ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin inline mr-2" />
            Loading report…
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Revenue"
                value={fmtMoney(summary.totals.revenue)}
                sub={`${summary.totals.orders} orders`}
                icon={<DollarSign className="size-4" />}
                tone="default"
                testId="kpi-revenue"
              />
              <Kpi
                label="Total fees"
                value={fmtMoney(summary.totals.totalFees)}
                sub={`Whatnot + payment`}
                icon={<CreditCard className="size-4" />}
                tone="warn"
                testId="kpi-fees"
              />
              <Kpi
                label="Gross profit"
                value={fmtMoney(summary.totals.grossProfit)}
                sub={`After fees & COGS`}
                icon={<TrendingUp className="size-4" />}
                tone={summary.totals.grossProfit >= 0 ? "good" : "bad"}
                testId="kpi-gross-profit"
              />
              <Kpi
                label="Net profit"
                value={fmtMoney(summary.totals.netProfit)}
                sub={`After expenses`}
                icon={
                  summary.totals.netProfit >= 0 ? (
                    <TrendingUp className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )
                }
                tone={summary.totals.netProfit >= 0 ? "good" : "bad"}
                testId="kpi-net-profit"
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="COGS"
                value={fmtMoney(summary.totals.cogs)}
                sub="Items sold cost"
                icon={<Package2 className="size-4" />}
                testId="kpi-cogs"
              />
              <Kpi
                label="Expenses"
                value={fmtMoney(summary.totals.expensesTotal)}
                sub="Logged costs"
                icon={<Receipt className="size-4" />}
                testId="kpi-expenses"
              />
              <Kpi
                label="Inventory on hand"
                value={fmtMoney(summary.inventory.inventoryValue)}
                sub={`${summary.inventory.activeCount} active items`}
                icon={<Wallet className="size-4" />}
                testId="kpi-inventory"
              />
              <Kpi
                label="Retail value"
                value={fmtMoney(summary.inventory.inventoryRetailValue)}
                sub="Listed prices total"
                icon={<BarChart3 className="size-4" />}
                testId="kpi-retail"
              />
            </div>

            {/* Monthly chart */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" />
                  Monthly performance
                </h3>
                <span className="text-xs text-muted-foreground">
                  Revenue · Fees · Profit
                </span>
              </div>
              {summary.monthly.length === 0 ? (
                <EmptyChart message="No order activity in this range yet." />
              ) : (
                <div className="h-[280px]" data-testid="chart-monthly">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={summary.monthly.map((m) => ({
                        ...m,
                        label: formatMonthLabel(m.month),
                      }))}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        tickFormatter={fmtMoneyCompact}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        stroke="hsl(var(--border))"
                        width={48}
                      />
                      <Tooltip
                        formatter={(v: number) => fmtMoney(v)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--brand-emerald))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="fees" name="Fees" fill="hsl(var(--brand-gold))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="profit" name="Profit" fill="#1f9268" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Expense pie + Budgets */}
            <div className="grid lg:grid-cols-2 gap-3">
              <Card className="p-4 sm:p-5">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                  <Receipt className="size-4 text-primary" />
                  Expenses by category
                </h3>
                {pieData.length === 0 ? (
                  <EmptyChart message="No expenses logged in this range." />
                ) : (
                  <div className="h-[240px]" data-testid="chart-expense-pie">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {pieData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={CATEGORY_COLORS[entry.name] || "#94a3b8"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => fmtMoney(v)}
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="p-4 sm:p-5">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                  <PiggyBank className="size-4 text-primary" />
                  Budget — {summary.budget.currentMonth}
                </h3>
                <div className="space-y-3.5">
                  <BudgetBar
                    label="Inventory spend"
                    spent={summary.budget.monthInventorySpend}
                    target={summary.settings.monthlyInventoryBudget}
                    color="hsl(var(--brand-emerald))"
                    testId="budget-inventory"
                  />
                  <BudgetBar
                    label="Payroll spend"
                    spent={summary.budget.monthPayrollSpend}
                    target={summary.settings.monthlyPayrollBudget}
                    color="hsl(var(--brand-gold))"
                    sublabel={
                      summary.budget.scheduledPayroll > 0
                        ? `Scheduled: ${fmtMoney(summary.budget.scheduledPayroll)}/mo`
                        : undefined
                    }
                    testId="budget-payroll"
                  />
                  <BudgetBar
                    label="Savings target"
                    spent={Math.max(0, summary.totals.netProfit)}
                    target={summary.settings.monthlySavingsTarget}
                    color="#1f9268"
                    sublabel="Funded from net profit"
                    testId="budget-savings"
                  />
                </div>
              </Card>
            </div>

            {/* Top items */}
            <Card className="p-4 sm:p-5">
              <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                <TrendingUp className="size-4 text-primary" />
                Top items by revenue
              </h3>
              {summary.topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No sales recorded in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-top-items">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-2 pr-3">Item</th>
                        <th className="text-left font-medium py-2 pr-3">SKU</th>
                        <th className="text-right font-medium py-2 pr-3">Units</th>
                        <th className="text-right font-medium py-2 pr-3">Revenue</th>
                        <th className="text-right font-medium py-2">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topItems.map((it) => (
                        <tr key={it.itemId} className="border-b border-border/50">
                          <td className="py-2 pr-3 max-w-[260px] truncate">{it.title || "(untitled)"}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{it.sku}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{it.units}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium">
                            {fmtMoney(it.revenue)}
                          </td>
                          <td
                            className={`py-2 text-right tabular-nums font-medium ${
                              it.profit >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-destructive"
                            }`}
                          >
                            {fmtMoney(it.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Expenses log */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-primary" />
                  Expenses log
                </h3>
                <Button
                  data-testid="button-add-expense"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddExpenseOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Add expense
                </Button>
              </div>
              {expenseRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No expenses recorded yet. Add inventory purchases, shipping supplies, payroll,
                  and other costs here to see your true net profit.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-expenses">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-2 pr-3">Date</th>
                        <th className="text-left font-medium py-2 pr-3">Category</th>
                        <th className="text-left font-medium py-2 pr-3">Description</th>
                        <th className="text-right font-medium py-2 pr-3">Amount</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseRows.map((e) => (
                        <tr key={e.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">{e.date}</td>
                          <td className="py-2 pr-3 capitalize">
                            <span
                              className="inline-block size-2 rounded-full mr-1.5 -mb-px"
                              style={{ backgroundColor: CATEGORY_COLORS[e.category] || "#94a3b8" }}
                            />
                            {e.category}
                          </td>
                          <td className="py-2 pr-3 max-w-[300px] truncate">{e.description}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium">
                            {fmtMoney(e.amount)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              data-testid={`button-delete-expense-${e.id}`}
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setDeleteExpenseId(e.id)}
                              aria-label="Delete expense"
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Employees */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  Employees & payroll
                </h3>
                <Button
                  data-testid="button-add-employee"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddEmployeeOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Add employee
                </Button>
              </div>
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No employees added. Add them here to track monthly payroll alongside your budgets.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-employees">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-2 pr-3">Name</th>
                        <th className="text-left font-medium py-2 pr-3">Role</th>
                        <th className="text-right font-medium py-2 pr-3">Monthly pay</th>
                        <th className="text-left font-medium py-2 pr-3">Active</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <EmployeeRow
                          key={emp.id}
                          emp={emp}
                          onDelete={() => setDeleteEmployeeId(emp.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
      />
      <AddExpenseDialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen} />
      <AddEmployeeDialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen} />

      <AlertDialog
        open={deleteExpenseId !== null}
        onOpenChange={(o) => !o && setDeleteExpenseId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the expense from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-expense"
              onClick={async () => {
                if (deleteExpenseId !== null) {
                  await apiRequest("DELETE", `/api/expenses/${deleteExpenseId}`);
                  queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
                  setDeleteExpenseId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteEmployeeId !== null}
        onOpenChange={(o) => !o && setDeleteEmployeeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes them from the payroll list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-employee"
              onClick={async () => {
                if (deleteEmployeeId !== null) {
                  await apiRequest("DELETE", `/api/employees/${deleteEmployeeId}`);
                  queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
                  setDeleteEmployeeId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
  testId?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <Card className="p-3.5" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function BudgetBar({
  label,
  spent,
  target,
  color,
  sublabel,
  testId,
}: {
  label: string;
  spent: number;
  target: number;
  color: string;
  sublabel?: string;
  testId?: string;
}) {
  const pct = target > 0 ? Math.min(100, (spent / target) * 100) : 0;
  const over = target > 0 && spent > target;
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <span className="text-sm font-medium">{label}</span>
          {sublabel && (
            <span className="text-[11px] text-muted-foreground ml-2">{sublabel}</span>
          )}
        </div>
        <div className="text-xs tabular-nums">
          <span className={over ? "text-destructive font-semibold" : "font-medium"}>
            {fmtMoney(spent)}
          </span>
          <span className="text-muted-foreground"> / {fmtMoney(target)}</span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? "hsl(var(--destructive))" : color,
          }}
        />
      </div>
      {target === 0 && (
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <AlertCircle className="size-3" />
          Set a target in Settings to track this budget.
        </div>
      )}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: BusinessSettings | undefined;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    commissionPct: "8",
    paymentFeePct: "2.9",
    paymentFeeFixed: "0.30",
    monthlyInventoryBudget: "0",
    monthlyPayrollBudget: "0",
    monthlySavingsTarget: "0",
    defaultShippingCost: "0",
  });

  // Initialize from settings whenever dialog opens
  useMemo(() => {
    if (open && settings) {
      setForm({
        commissionPct: String(settings.commissionPct ?? 8),
        paymentFeePct: String(settings.paymentFeePct ?? 2.9),
        paymentFeeFixed: String(settings.paymentFeeFixed ?? 0.3),
        monthlyInventoryBudget: String(settings.monthlyInventoryBudget ?? 0),
        monthlyPayrollBudget: String(settings.monthlyPayrollBudget ?? 0),
        monthlySavingsTarget: String(settings.monthlySavingsTarget ?? 0),
        defaultShippingCost: String(settings.defaultShippingCost ?? 0),
      });
    }
  }, [open, settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        commissionPct: Number(form.commissionPct) || 0,
        paymentFeePct: Number(form.paymentFeePct) || 0,
        paymentFeeFixed: Number(form.paymentFeeFixed) || 0,
        monthlyInventoryBudget: Number(form.monthlyInventoryBudget) || 0,
        monthlyPayrollBudget: Number(form.monthlyPayrollBudget) || 0,
        monthlySavingsTarget: Number(form.monthlySavingsTarget) || 0,
        defaultShippingCost: Number(form.defaultShippingCost) || 0,
      };
      const res = await apiRequest("PATCH", "/api/settings", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Settings saved" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const Field = ({
    label,
    field,
    suffix,
    step = "0.01",
  }: {
    label: string;
    field: keyof typeof form;
    suffix?: string;
    step?: string;
  }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          data-testid={`input-${field}`}
          type="number"
          step={step}
          min="0"
          value={form[field]}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
          className={suffix ? "pr-8" : ""}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Business settings</DialogTitle>
          <DialogDescription>
            Whatnot fee structure and monthly budget targets. Defaults reflect Whatnot's published
            8% commission and 2.9% + $0.30 payment processing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Whatnot fees
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Commission" field="commissionPct" suffix="%" />
              <Field label="Payment fee" field="paymentFeePct" suffix="%" />
              <Field label="Fixed fee" field="paymentFeeFixed" suffix="$" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Monthly budgets &amp; targets
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Inventory budget" field="monthlyInventoryBudget" suffix="$" step="1" />
              <Field label="Payroll budget" field="monthlyPayrollBudget" suffix="$" step="1" />
              <Field label="Savings target" field="monthlySavingsTarget" suffix="$" step="1" />
              <Field label="Default shipping" field="defaultShippingCost" suffix="$" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="button-save-settings"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="gap-1.5"
          >
            {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(todayStr);
  const [category, setCategory] = useState<string>("inventory");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setDate(todayStr());
    setCategory("inventory");
    setAmount("");
    setDescription("");
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/expenses", {
        date,
        category,
        amount: Number(amount) || 0,
        description: description.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Expense added" });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Track inventory purchases, shipping supplies, payroll, software, and any other business
            costs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Date</Label>
              <Input
                data-testid="input-expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              data-testid="input-expense-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              data-testid="input-expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Estate sale haul — crystal lot"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="button-save-expense"
            onClick={() => addMut.mutate()}
            disabled={!amount || addMut.isPending}
            className="gap-1.5"
          >
            {addMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Add expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [monthlyPay, setMonthlyPay] = useState("");
  const [active, setActive] = useState(true);

  const reset = () => {
    setName("");
    setRole("");
    setMonthlyPay("");
    setActive(true);
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/employees", {
        name: name.trim(),
        role: role.trim(),
        monthlyPay: Number(monthlyPay) || 0,
        active: active ? 1 : 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
      toast({ title: "Employee added" });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            Used to calculate monthly payroll alongside your budget targets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name</Label>
            <Input
              data-testid="input-employee-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              data-testid="input-employee-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Show host, Packer, etc."
            />
          </div>
          <div>
            <Label>Monthly pay</Label>
            <Input
              data-testid="input-employee-pay"
              type="number"
              step="0.01"
              min="0"
              value={monthlyPay}
              onChange={(e) => setMonthlyPay(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="cursor-pointer">Active</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inactive employees are excluded from scheduled payroll totals.
              </p>
            </div>
            <Switch
              data-testid="switch-employee-active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="button-save-employee"
            onClick={() => addMut.mutate()}
            disabled={!name.trim() || addMut.isPending}
            className="gap-1.5"
          >
            {addMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Add employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeRow({ emp, onDelete }: { emp: Employee; onDelete: () => void }) {
  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await apiRequest("PATCH", `/api/employees/${emp.id}`, {
        active: active ? 1 : 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });
    },
  });
  return (
    <tr className="border-b border-border/50" data-testid={`row-employee-${emp.id}`}>
      <td className="py-2 pr-3 font-medium">{emp.name}</td>
      <td className="py-2 pr-3 text-muted-foreground">{emp.role}</td>
      <td className="py-2 pr-3 text-right tabular-nums font-medium">
        {fmtMoney(emp.monthlyPay)}
      </td>
      <td className="py-2 pr-3">
        <Switch
          data-testid={`switch-active-${emp.id}`}
          checked={!!emp.active}
          onCheckedChange={(v) => toggleActive.mutate(v)}
        />
      </td>
      <td className="py-2 text-right">
        <Button
          data-testid={`button-delete-employee-${emp.id}`}
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onDelete}
          aria-label="Remove employee"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
