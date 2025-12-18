import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function Forecast() {
  const [searchTerm, setSearchTerm] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState<string>("all");
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());

  const { data: forecasts, isLoading } = trpc.forecasts.list.useQuery();
  const { data: hospitals } = trpc.hospitals.list.useQuery();

  // Filter forecasts
  const filteredForecasts = useMemo(() => {
    if (!forecasts) return [];
    return forecasts.filter(f => {
      const matchesSearch = searchTerm === "" || 
        f.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.areaName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.productCode || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesHospital = hospitalFilter === "all" || f.hospitalId.toString() === hospitalFilter;
      return matchesSearch && matchesHospital;
    });
  }, [forecasts, searchTerm, hospitalFilter]);

  // Aggregate by SKU (productCode)
  const skuAggregates = useMemo(() => {
    const agg: Record<string, { 
      sku: string; 
      description: string;
      type: string;
      size: string;
      color: string;
      totalQty: number; 
      areaCount: number;
      items: typeof filteredForecasts;
    }> = {};
    
    for (const f of filteredForecasts) {
      const sku = f.productCode || 'unknown';
      if (!agg[sku]) {
        agg[sku] = { 
          sku, 
          description: f.productDescription || '',
          type: f.productType,
          size: f.productSize,
          color: f.productColor,
          totalQty: 0, 
          areaCount: 0,
          items: []
        };
      }
      agg[sku].totalQty += f.expectedQuantity;
      agg[sku].areaCount += 1;
      agg[sku].items.push(f);
    }
    
    // Sort by SKU alphabetically
    return Object.values(agg).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [filteredForecasts]);

  // Calculate totals
  const totalQty = skuAggregates.reduce((sum, s) => sum + s.totalQty, 0);
  const totalAreas = skuAggregates.reduce((sum, s) => sum + s.areaCount, 0);

  const toggleSku = (sku: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  };

  const handleExport = () => {
    if (!filteredForecasts.length) return;
    const csv = [
      ['SKU', 'Description', 'Hospital', 'Area', 'Quantity', 'Expected Date'].join(','),
      ...filteredForecasts.map(f => [
        `"${f.productCode || 'unknown'}"`,
        `"${f.productDescription || ''}"`,
        `"${f.hospitalName}"`, 
        `"${f.areaName}"`, 
        f.expectedQuantity,
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

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{skuAggregates.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalQty}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Area Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAreas}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-lg">Filter</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by SKU, hospital, or area..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full md:w-[250px]"><SelectValue placeholder="Hospital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals?.map(h => <SelectItem key={h.id} value={h.id.toString()}>{h.customerName}</SelectItem>)}
                </SelectContent>
              </Select>
              {(hospitalFilter !== 'all' || searchTerm) && (
                <Button variant="ghost" onClick={() => { setHospitalFilter('all'); setSearchTerm(''); }}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SKU List Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Forecast by SKU ({skuAggregates.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : skuAggregates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No forecast data available.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Product Code</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Areas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skuAggregates.map((sku) => (
                      <>
                        <TableRow 
                          key={sku.sku} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleSku(sku.sku)}
                        >
                          <TableCell className="py-2">
                            {expandedSkus.has(sku.sku) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">{sku.sku}</TableCell>
                          <TableCell className="text-right font-semibold">{sku.totalQty}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{sku.areaCount}</Badge>
                          </TableCell>
                        </TableRow>
                        {expandedSkus.has(sku.sku) && (
                          <TableRow key={`${sku.sku}-details`}>
                            <TableCell colSpan={5} className="bg-muted/30 p-0">
                              <div className="px-8 py-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Hospital</TableHead>
                                      <TableHead>Area</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead>Expected Date</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {sku.items.map((item, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="text-sm">{item.hospitalName}</TableCell>
                                        <TableCell className="text-sm">{item.areaName}</TableCell>
                                        <TableCell className="text-right text-sm">{item.expectedQuantity}</TableCell>
                                        <TableCell className="text-sm">
                                          {item.expectedReorderDate ? new Date(item.expectedReorderDate).toLocaleDateString() : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
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
