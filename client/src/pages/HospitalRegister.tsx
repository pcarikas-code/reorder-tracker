import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Building2, Palette, Layers } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Color badge styling based on color name
const getColorBadgeStyle = (color: string): string => {
  const colorMap: Record<string, string> = {
    'Teal': 'bg-teal-100 text-teal-800 border-teal-300',
    'Mid Blue': 'bg-blue-100 text-blue-800 border-blue-300',
    'Pale Blue': 'bg-sky-100 text-sky-800 border-sky-300',
    'Pale Yellow': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'Grey': 'bg-gray-100 text-gray-800 border-gray-300',
    'Lavender': 'bg-purple-100 text-purple-800 border-purple-300',
    'White': 'bg-white text-gray-800 border-gray-300',
    'Golden Glow White': 'bg-amber-50 text-amber-800 border-amber-300',
    'Sand White': 'bg-orange-50 text-orange-800 border-orange-300',
    'Sand Pale Blue': 'bg-cyan-50 text-cyan-800 border-cyan-300',
    'GMB Pale Blue': 'bg-indigo-50 text-indigo-800 border-indigo-300',
  };
  return colorMap[color] || 'bg-gray-100 text-gray-800 border-gray-300';
};

// Curtain type badge styling
const getCurtainTypeBadgeStyle = (type: string): string => {
  const typeMap: Record<string, string> = {
    'SC': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'SMTC': 'bg-violet-100 text-violet-800 border-violet-300',
    'SLD': 'bg-orange-100 text-orange-800 border-orange-300',
    'Mixed': 'bg-pink-100 text-pink-800 border-pink-300',
  };
  return typeMap[type] || 'bg-gray-100 text-gray-800 border-gray-300';
};

export default function HospitalRegister() {
  const [selectedHospital, setSelectedHospital] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: hospitals } = trpc.hospitals.list.useQuery();
  const { data: register, isLoading } = trpc.hospitals.register.useQuery(
    { hospitalId: parseInt(selectedHospital) },
    { enabled: !!selectedHospital && selectedHospital !== "" }
  );

  // Get selected hospital name
  const selectedHospitalName = useMemo(() => {
    if (!selectedHospital || !hospitals) return "";
    const hospital = hospitals.find(h => h.id.toString() === selectedHospital);
    return hospital?.customerName || "";
  }, [selectedHospital, hospitals]);

  // Filter register entries
  const filteredRegister = useMemo(() => {
    if (!register) return [];
    return register.filter(entry => {
      const matchesSearch = searchTerm === "" || 
        entry.areaName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || entry.curtainType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [register, searchTerm, typeFilter]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!register) return { total: 0, sc: 0, smtc: 0, sld: 0, mixed: 0 };
    return {
      total: register.length,
      sc: register.filter(e => e.curtainType === 'SC').length,
      smtc: register.filter(e => e.curtainType === 'SMTC').length,
      sld: register.filter(e => e.curtainType === 'SLD').length,
      mixed: register.filter(e => e.curtainType === 'Mixed').length,
    };
  }, [register]);

  const handleExport = () => {
    if (!filteredRegister.length || !selectedHospitalName) return;
    const csv = [
      ['Area', 'Curtain Type', 'Last Color', 'Last Order Date', 'Last Order #', 'Total Orders'].join(','),
      ...filteredRegister.map(entry => [
        `"${entry.areaName}"`,
        entry.curtainType,
        `"${entry.lastColor}"`,
        entry.lastOrderDate ? new Date(entry.lastOrderDate).toLocaleDateString() : 'N/A',
        entry.lastOrderNumber || 'N/A',
        entry.totalOrders
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = selectedHospitalName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    a.download = `hospital-register-${safeName}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hospital Register</h1>
            <p className="text-muted-foreground">Snapshot view of curtain types and colors by area</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!filteredRegister.length}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>

        {/* Hospital Selector */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Hospital
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Combobox
              className="w-full max-w-md"
              placeholder="Choose a hospital..."
              searchPlaceholder="Search hospitals..."
              emptyText="No hospitals found."
              value={selectedHospital}
              onValueChange={setSelectedHospital}
              options={hospitals?.map(h => ({ value: h.id.toString(), label: h.customerName })) || []}
            />
          </CardContent>
        </Card>

        {selectedHospital && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Areas</p>
                      <p className="text-2xl font-bold">{stats.total}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setTypeFilter(typeFilter === 'SC' ? 'all' : 'SC')}>
                <CardContent className="pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">SC (Standard)</p>
                    <p className="text-2xl font-bold text-emerald-600">{stats.sc}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setTypeFilter(typeFilter === 'SMTC' ? 'all' : 'SMTC')}>
                <CardContent className="pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">SMTC (Mesh Top)</p>
                    <p className="text-2xl font-bold text-violet-600">{stats.smtc}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setTypeFilter(typeFilter === 'SLD' ? 'all' : 'SLD')}>
                <CardContent className="pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">SLD (Long Drop)</p>
                    <p className="text-2xl font-bold text-orange-600">{stats.sld}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setTypeFilter(typeFilter === 'Mixed' ? 'all' : 'Mixed')}>
                <CardContent className="pt-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Mixed Types</p>
                    <p className="text-2xl font-bold text-pink-600">{stats.mixed}</p>
                  </div>
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
                    <Input 
                      placeholder="Search areas..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      className="pl-9" 
                    />
                  </div>
                  <div className="flex gap-1 p-1 bg-muted rounded-lg">
                    {['all', 'SC', 'SMTC', 'SLD', 'Mixed'].map((type) => (
                      <Button
                        key={type}
                        variant={typeFilter === type ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTypeFilter(type)}
                        className="px-3"
                      >
                        {type === 'all' ? 'All Types' : type}
                      </Button>
                    ))}
                  </div>
                  {(typeFilter !== 'all' || searchTerm) && (
                    <Button variant="ghost" onClick={() => { setTypeFilter('all'); setSearchTerm(''); }}>Clear</Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Register Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Area Register ({filteredRegister.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredRegister.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {register?.length === 0 
                      ? "No areas with sales orders found for this hospital."
                      : "No areas match your filter criteria."}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Area</TableHead>
                          <TableHead>Curtain Type</TableHead>
                          <TableHead>Last Color</TableHead>
                          <TableHead>Last Order</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRegister.map((entry) => (
                          <TableRow key={entry.areaId}>
                            <TableCell className="font-medium">{entry.areaName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getCurtainTypeBadgeStyle(entry.curtainType)}>
                                {entry.curtainType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getColorBadgeStyle(entry.lastColor)}>
                                {entry.lastColor}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {entry.lastOrderDate ? new Date(entry.lastOrderDate).toLocaleDateString() : '-'}
                              </div>
                              {entry.lastOrderNumber && (
                                <div className="text-xs text-muted-foreground">{entry.lastOrderNumber}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{entry.totalOrders}</Badge>
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

        {!selectedHospital && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a hospital to view its register</p>
                <p className="text-sm mt-1">Choose a hospital from the dropdown above to see all areas with their curtain types and colors.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
