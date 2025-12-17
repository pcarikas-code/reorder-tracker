import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Package } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  mesh_top: 'Mesh Top',
  long_drop: 'Long Drop',
  other: 'Other',
};

const SIZE_LABELS: Record<string, string> = {
  full: 'Full Width',
  medium: 'Medium Width',
  half: 'Half Width',
  other: 'Other',
};

export default function Forecast() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [hospitalFilter, setHospitalFilter] = useState<string>("all");

  const { data: forecasts, isLoading } = trpc.forecasts.list.useQuery();
  const { data: summary } = trpc.forecasts.summary.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();

  const filteredForecasts = useMemo(() => {
    if (!forecasts) return [];
    return forecasts.filter(f => {
      const matchesSearch = searchTerm === "" || 
        f.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.areaName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.productColor.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || f.productType === typeFilter;
      const matchesSize = sizeFilter === "all" || f.productSize === sizeFilter;
      const matchesHospital = hospitalFilter === "all" || f.hospitalId.toString() === hospitalFilter;
      return matchesSearch && matchesType && matchesSize && matchesHospital;
    });
  }, [forecasts, searchTerm, typeFilter, sizeFilter, hospitalFilter]);

  const aggregatedByProduct = useMemo(() => {
    const agg: Record<string, { type: string; size: string; color: string; qty: number; areas: number }> = {};
    for (const f of filteredForecasts) {
      const key = `${f.productType}-${f.productSize}-${f.productColor}`;
      if (!agg[key]) agg[key] = { type: f.productType, size: f.productSize, color: f.productColor, qty: 0, areas: 0 };
      agg[key].qty += f.expectedQuantity;
      agg[key].areas += 1;
    }
    return Object.values(agg).sort((a, b) => b.qty - a.qty);
  }, [filteredForecasts]);

  const handleExport = () => {
    if (!filteredForecasts.length) return;
    const csv = [
      ['Hospital', 'Area', 'Type', 'Size', 'Color', 'Quantity', 'Expected Date'].join(','),
      ...filteredForecasts.map(f => [
        `"${f.hospitalName}"`, `"${f.areaName}"`, TYPE_LABELS[f.productType] || f.productType,
        SIZE_LABELS[f.productSize] || f.productSize, `"${f.productColor}"`, f.expectedQuantity,
        f.expectedReorderDate ? new Date(f.expectedReorderDate).toLocaleDateString() : 'N/A'
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-forecast-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stock Forecast</h1>
            <p className="text-muted-foreground">Expected inventory needs based on 2-year replacement cycle</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!filteredForecasts.length}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && summary.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {summary.slice(0, 4).map((s, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {TYPE_LABELS[s.type] || s.type} - {SIZE_LABELS[s.size] || s.size}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{s.totalQuantity}</div>
                  <p className="text-xs text-muted-foreground">{s.color} • {s.areaCount} areas</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg">Filter Forecasts</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="mesh_top">Mesh Top</SelectItem>
                  <SelectItem value="long_drop">Long Drop</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sizeFilter} onValueChange={setSizeFilter}>
                <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  <SelectItem value="full">Full Width</SelectItem>
                  <SelectItem value="medium">Medium Width</SelectItem>
                  <SelectItem value="half">Half Width</SelectItem>
                </SelectContent>
              </Select>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Hospital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals?.map(h => <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>)}
                </SelectContent>
              </Select>
              {(typeFilter !== 'all' || sizeFilter !== 'all' || hospitalFilter !== 'all' || searchTerm) && (
                <Button variant="ghost" onClick={() => { setTypeFilter('all'); setSizeFilter('all'); setHospitalFilter('all'); setSearchTerm(''); }}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Aggregated Summary */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Product Summary ({aggregatedByProduct.length} products)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : aggregatedByProduct.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No forecast data available.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Areas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedByProduct.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge variant="outline">{TYPE_LABELS[p.type] || p.type}</Badge></TableCell>
                        <TableCell>{SIZE_LABELS[p.size] || p.size}</TableCell>
                        <TableCell>{p.color}</TableCell>
                        <TableCell className="text-right font-medium">{p.qty}</TableCell>
                        <TableCell className="text-right">{p.areas}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailed Forecast */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Detailed Forecast ({filteredForecasts.length} items)</CardTitle></CardHeader>
          <CardContent>
            {filteredForecasts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No data matches your filters.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Expected Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredForecasts.slice(0, 100).map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{f.hospitalName}</TableCell>
                        <TableCell>{f.areaName}</TableCell>
                        <TableCell><Badge variant="outline">{TYPE_LABELS[f.productType] || f.productType}</Badge></TableCell>
                        <TableCell>{SIZE_LABELS[f.productSize] || f.productSize}</TableCell>
                        <TableCell>{f.productColor}</TableCell>
                        <TableCell className="text-right">{f.expectedQuantity}</TableCell>
                        <TableCell>{f.expectedReorderDate ? new Date(f.expectedReorderDate).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredForecasts.length > 100 && (
                  <div className="text-center py-2 text-sm text-muted-foreground">Showing first 100 of {filteredForecasts.length} items. Use filters or export for full data.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
