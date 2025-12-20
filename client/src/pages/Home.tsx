import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AlertTriangle, CheckCircle, Clock, Search, Download, Bell, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type StatusFilter = 'all' | 'on_order' | 'overdue' | 'due_soon' | 'near_soon' | 'far_soon';

// Component for area name with hover to show purchase history
function AreaNameWithHover({ areaId, areaName }: { areaId: number; areaName: string }) {
  const [hasHovered, setHasHovered] = useState(false);
  const utils = trpc.useUtils();
  const { data: purchases, isLoading } = trpc.areas.getPurchases.useQuery(
    { areaId },
    { enabled: hasHovered }
  );

  const handleHover = () => {
    if (!hasHovered) {
      setHasHovered(true);
      utils.areas.getPurchases.fetch({ areaId });
    }
  };

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild onMouseEnter={handleHover}>
        <span className="cursor-help underline decoration-dotted underline-offset-2">{areaName}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Purchase History</h4>
          {!hasHovered || isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : purchases && purchases.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-auto">
              {purchases.slice(0, 10).map((p) => (
                <div key={p.id} className="text-xs border-b pb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{p.orderNumber}</span>
                    <span className="text-muted-foreground">
                      {new Date(p.orderDate).toLocaleDateString()}
                    </span>
                  </div>
                  {p.customerRef && (
                    <div className="text-muted-foreground truncate mt-0.5" title={p.customerRef}>
                      {p.customerRef}
                    </div>
                  )}
                </div>
              ))}
              {purchases.length > 10 && (
                <div className="text-xs text-muted-foreground pt-1">
                  +{purchases.length - 10} more...
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No purchases found</div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hospitalFilter, setHospitalFilter] = useState<string>("all");

  const { data: statuses, isLoading } = trpc.reorders.statuses.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();
  const sendNotifications = trpc.notifications.checkAndSend.useMutation({
    onSuccess: (data) => toast.success(`Sent ${data.notificationsSent} notification(s)`),
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const filteredStatuses = useMemo(() => {
    if (!statuses) return [];
    return statuses.filter(s => {
      const matchesSearch = searchTerm === "" || s.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) || s.areaName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesHospital = hospitalFilter === "all" || s.hospitalId.toString() === hospitalFilter;
      return matchesSearch && matchesStatus && matchesHospital;
    });
  }, [statuses, searchTerm, statusFilter, hospitalFilter]);

  const statusCounts = useMemo(() => {
    if (!statuses) return { on_order: 0, overdue: 0, due_soon: 0, near_soon: 0, far_soon: 0 };
    return {
      on_order: statuses.filter(s => s.status === 'on_order').length,
      overdue: statuses.filter(s => s.status === 'overdue').length,
      due_soon: statuses.filter(s => s.status === 'due_soon').length,
      near_soon: statuses.filter(s => s.status === 'near_soon').length,
      far_soon: statuses.filter(s => s.status === 'far_soon').length,
    };
  }, [statuses]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'on_order': return <Badge variant="secondary" className="gap-1 bg-purple-100 text-purple-800 hover:bg-purple-100"><Clock className="h-3 w-3" />On Order</Badge>;
      case 'overdue': return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Overdue</Badge>;
      case 'due_soon': return <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"><Clock className="h-3 w-3" />Due Soon</Badge>;
      case 'near_soon': return <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="h-3 w-3" />Near Soon</Badge>;
      case 'far_soon': return <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3" />Far Soon</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const handleExport = () => {
    if (!filteredStatuses.length) return;
    const csv = [
      ['Hospital', 'Area', 'Status', 'Order Date', 'Invoice Date', 'Due Date', 'Days Until Due'].join(','),
      ...filteredStatuses.map(s => [`"${s.hospitalName}"`, `"${s.areaName}"`, s.status, s.lastOrderDate ? new Date(s.lastOrderDate).toLocaleDateString() : 'N/A', s.lastPurchaseDate ? new Date(s.lastPurchaseDate).toLocaleDateString() : 'Awaiting', s.reorderDueDate ? new Date(s.reorderDueDate).toLocaleDateString() : 'N/A', s.daysUntilDue ?? 'N/A'].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reorder-status-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reorder Status</h1>
            <p className="text-muted-foreground">Track hospital area curtain replacement cycles</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={!filteredStatuses.length}><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button onClick={() => sendNotifications.mutate()} disabled={sendNotifications.isPending}><Bell className="h-4 w-4 mr-2" />Send Alerts</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card className="cursor-pointer hover:border-destructive transition-colors" onClick={() => setStatusFilter('overdue')}>
            <CardHeader className="pb-2"><CardDescription>Overdue</CardDescription><CardTitle className="text-3xl text-destructive">{statusCounts.overdue}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Past 2-year replacement date</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-purple-500 transition-colors" onClick={() => setStatusFilter('on_order')}>
            <CardHeader className="pb-2"><CardDescription>On Order</CardDescription><CardTitle className="text-3xl text-purple-600">{statusCounts.on_order}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Awaiting delivery</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-amber-500 transition-colors" onClick={() => setStatusFilter('due_soon')}>
            <CardHeader className="pb-2"><CardDescription>Due Soon</CardDescription><CardTitle className="text-3xl text-amber-600">{statusCounts.due_soon}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">0-90 days</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-blue-500 transition-colors" onClick={() => setStatusFilter('near_soon')}>
            <CardHeader className="pb-2"><CardDescription>Near Soon</CardDescription><CardTitle className="text-3xl text-blue-600">{statusCounts.near_soon}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">90-180 days</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-500 transition-colors" onClick={() => setStatusFilter('far_soon')}>
            <CardHeader className="pb-2"><CardDescription>Far Soon</CardDescription><CardTitle className="text-3xl text-green-600">{statusCounts.far_soon}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">180-360 days</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg">Filter Results</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search hospitals or areas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="on_order">On Order</SelectItem>
                  <SelectItem value="due_soon">Due Soon (0-90)</SelectItem>
                  <SelectItem value="near_soon">Near Soon (90-180)</SelectItem>
                  <SelectItem value="far_soon">Far Soon (180-360)</SelectItem>
                </SelectContent>
              </Select>
              <Combobox
                className="w-full md:w-[250px]"
                placeholder="All Hospitals"
                searchPlaceholder="Search hospitals..."
                emptyText="No hospitals found."
                value={hospitalFilter}
                onValueChange={setHospitalFilter}
                options={[
                  { value: "all", label: "All Hospitals" },
                  ...(hospitals?.map(h => ({ value: h.id.toString(), label: h.customerName })) || [])
                ]}
              />
              {(statusFilter !== 'all' || hospitalFilter !== 'all' || searchTerm) && <Button variant="ghost" onClick={() => { setStatusFilter('all'); setHospitalFilter('all'); setSearchTerm(''); }}>Clear</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Hospital Areas ({filteredStatuses.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : filteredStatuses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{statuses?.length === 0 ? <p>No data available. Run a sync to import data from Unleashed.</p> : <p>No results match your filters.</p>}</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Last Invoice</TableHead>
                      <TableHead>Next Due</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStatuses.map((status) => (
                      <TableRow key={status.areaId}>
                        <TableCell className="font-medium">
                          <Link href={`/hospitals?id=${status.hospitalId}`} className="hover:text-primary hover:underline inline-flex items-center gap-1">
                            {status.hospitalName}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </Link>
                        </TableCell>
                        <TableCell>
                          <AreaNameWithHover areaId={status.areaId} areaName={status.areaName} />
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(status.status)}
                          {status.orderNumber && (
                            <span className="ml-2 text-xs text-muted-foreground font-mono">{status.orderNumber}</span>
                          )}
                        </TableCell>
                        <TableCell>{status.lastOrderDate ? new Date(status.lastOrderDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>{status.lastPurchaseDate ? new Date(status.lastPurchaseDate).toLocaleDateString() : <span className="text-purple-600 text-xs">Awaiting</span>}</TableCell>
                        <TableCell>{status.reorderDueDate ? new Date(status.reorderDueDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-right">{status.daysUntilDue !== null ? <span className={status.daysUntilDue < 0 ? 'text-destructive font-medium' : status.daysUntilDue < 90 ? 'text-amber-600' : status.daysUntilDue < 180 ? 'text-blue-600' : 'text-green-600'}>{status.daysUntilDue}</span> : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
