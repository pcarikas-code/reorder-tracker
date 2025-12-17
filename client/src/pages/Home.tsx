import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Clock, Search, Download, Bell } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type StatusFilter = 'all' | 'overdue' | 'due_soon' | 'on_track' | 'no_purchase';

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
    if (!statuses) return { overdue: 0, due_soon: 0, on_track: 0, no_purchase: 0 };
    return {
      overdue: statuses.filter(s => s.status === 'overdue').length,
      due_soon: statuses.filter(s => s.status === 'due_soon').length,
      on_track: statuses.filter(s => s.status === 'on_track').length,
      no_purchase: statuses.filter(s => s.status === 'no_purchase').length,
    };
  }, [statuses]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overdue': return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Overdue</Badge>;
      case 'due_soon': return <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"><Clock className="h-3 w-3" />Due Soon</Badge>;
      case 'on_track': return <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3" />On Track</Badge>;
      default: return <Badge variant="outline">No Purchase</Badge>;
    }
  };

  const handleExport = () => {
    if (!filteredStatuses.length) return;
    const csv = [
      ['Hospital', 'Area', 'Status', 'Last Purchase', 'Due Date', 'Days Until Due'].join(','),
      ...filteredStatuses.map(s => [`"${s.hospitalName}"`, `"${s.areaName}"`, s.status, s.lastPurchaseDate ? new Date(s.lastPurchaseDate).toLocaleDateString() : 'N/A', s.reorderDueDate ? new Date(s.reorderDueDate).toLocaleDateString() : 'N/A', s.daysUntilDue ?? 'N/A'].join(','))
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="cursor-pointer hover:border-destructive transition-colors" onClick={() => setStatusFilter('overdue')}>
            <CardHeader className="pb-2"><CardDescription>Overdue</CardDescription><CardTitle className="text-3xl text-destructive">{statusCounts.overdue}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Past 2-year replacement date</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-amber-500 transition-colors" onClick={() => setStatusFilter('due_soon')}>
            <CardHeader className="pb-2"><CardDescription>Due Soon</CardDescription><CardTitle className="text-3xl text-amber-600">{statusCounts.due_soon}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Within 90 days</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-500 transition-colors" onClick={() => setStatusFilter('on_track')}>
            <CardHeader className="pb-2"><CardDescription>On Track</CardDescription><CardTitle className="text-3xl text-green-600">{statusCounts.on_track}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">More than 90 days out</p></CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-gray-400 transition-colors" onClick={() => setStatusFilter('no_purchase')}>
            <CardHeader className="pb-2"><CardDescription>No Purchase</CardDescription><CardTitle className="text-3xl">{statusCounts.no_purchase}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">No purchase history</p></CardContent>
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
                  <SelectItem value="due_soon">Due Soon</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="no_purchase">No Purchase</SelectItem>
                </SelectContent>
              </Select>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full md:w-[220px]"><SelectValue placeholder="Hospital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals?.map(h => <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>)}
                </SelectContent>
              </Select>
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
                      <TableHead>Last Purchase</TableHead>
                      <TableHead>Reorder Due</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStatuses.map((status) => (
                      <TableRow key={status.areaId}>
                        <TableCell className="font-medium">{status.hospitalName}</TableCell>
                        <TableCell>{status.areaName}</TableCell>
                        <TableCell>{getStatusBadge(status.status)}</TableCell>
                        <TableCell>{status.lastPurchaseDate ? new Date(status.lastPurchaseDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>{status.reorderDueDate ? new Date(status.reorderDueDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-right">{status.daysUntilDue !== null ? <span className={status.daysUntilDue < 0 ? 'text-destructive font-medium' : status.daysUntilDue < 90 ? 'text-amber-600' : ''}>{status.daysUntilDue}</span> : '-'}</TableCell>
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
