import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Building2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function Hospitals() {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const { data: hospitals, isLoading: hospitalsLoading } = trpc.hospitals.list.useQuery();
  const { data: purchases, isLoading: purchasesLoading } = trpc.hospitals.getPurchases.useQuery(
    { hospitalId: parseInt(selectedHospitalId) },
    { enabled: !!selectedHospitalId }
  );
  const { data: areas } = trpc.areas.byHospital.useQuery(
    { hospitalId: parseInt(selectedHospitalId) },
    { enabled: !!selectedHospitalId }
  );

  const selectedHospital = hospitals?.find(h => h.id.toString() === selectedHospitalId);

  // Get unique areas from purchases for filtering
  const purchaseAreas = useMemo(() => {
    if (!purchases) return [];
    const areaMap = new Map<number, string>();
    for (const p of purchases) {
      if (p.areaId && p.areaName) {
        areaMap.set(p.areaId, p.areaName);
      }
    }
    return Array.from(areaMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    return purchases.filter(p => {
      const matchesSearch = searchTerm === "" || 
        p.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.customerRef?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.areaName?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesArea = areaFilter === "all" || 
        (areaFilter === "unmatched" && !p.areaId) ||
        (p.areaId?.toString() === areaFilter);
      return matchesSearch && matchesArea;
    });
  }, [purchases, searchTerm, areaFilter]);

  const handleExport = () => {
    if (!filteredPurchases.length || !selectedHospital) return;
    const csv = [
      ['Order Number', 'Order Date', 'Customer Reference', 'Area', 'Raw Area Text'].join(','),
      ...filteredPurchases.map(p => [
        `"${p.orderNumber}"`,
        new Date(p.orderDate).toLocaleDateString(),
        `"${p.customerRef || ''}"`,
        `"${p.areaName || 'Unmatched'}"`,
        `"${p.rawAreaText || ''}"`,
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedHospital.customerName.replace(/[^a-z0-9]/gi, '-')}-purchases-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hospital Management</h1>
            <p className="text-muted-foreground">View purchase history by hospital and area</p>
          </div>
          {selectedHospitalId && filteredPurchases.length > 0 && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
          )}
        </div>

        {/* Hospital Selection */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Hospital
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedHospitalId} onValueChange={(v) => { setSelectedHospitalId(v); setAreaFilter("all"); setSearchTerm(""); }}>
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue placeholder="Choose a hospital to view purchases..." />
              </SelectTrigger>
              <SelectContent>
                {hospitalsLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : (
                  hospitals?.map(h => (
                    <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedHospitalId && (
          <>
            {/* Filters */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Filter Purchases</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search by order number, reference, or area..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      className="pl-9" 
                    />
                  </div>
                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="w-full md:w-[250px]">
                      <SelectValue placeholder="Filter by area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      <SelectItem value="unmatched">Unmatched Only</SelectItem>
                      {purchaseAreas.map(a => (
                        <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(areaFilter !== 'all' || searchTerm) && (
                    <Button variant="ghost" onClick={() => { setAreaFilter('all'); setSearchTerm(''); }}>Clear</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Purchases Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedHospital?.customerName} - Purchases ({filteredPurchases.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {purchasesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredPurchases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {purchases?.length === 0 ? (
                      <p>No purchases found for this hospital.</p>
                    ) : (
                      <p>No results match your filters.</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order Number</TableHead>
                          <TableHead>Order Date</TableHead>
                          <TableHead>Customer Reference</TableHead>
                          <TableHead>Area</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchases.map((purchase) => (
                          <TableRow key={purchase.id}>
                            <TableCell className="font-medium">{purchase.orderNumber}</TableCell>
                            <TableCell>{new Date(purchase.orderDate).toLocaleDateString()}</TableCell>
                            <TableCell className="max-w-[300px] truncate" title={purchase.customerRef || undefined}>
                              {purchase.customerRef || '-'}
                            </TableCell>
                            <TableCell>
                              {purchase.areaName ? (
                                <span>{purchase.areaName}</span>
                              ) : (
                                <span className="text-muted-foreground italic">Unmatched</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!selectedHospitalId && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a hospital above to view its purchase history.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
