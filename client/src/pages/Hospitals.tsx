import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Download, Building2, Pencil, Link2, Ban, RotateCcw } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";

type Purchase = {
  id: number;
  orderNumber: string;
  orderDate: Date;
  invoiceDate: Date | null;
  customerRef: string | null;
  rawAreaText: string | null;
  areaId: number | null;
  areaName: string | null;
  totalCurtains: number;
};

export default function Hospitals() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const hospitalIdFromUrl = urlParams.get('id');
  
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Hospital search state
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [hospitalHighlightedIndex, setHospitalHighlightedIndex] = useState(-1);
  
  // Match/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [areaInput, setAreaInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);


  const utils = trpc.useUtils();
  const { data: hospitals, isLoading: hospitalsLoading } = trpc.hospitals.list.useQuery();
  const { data: purchases, isLoading: purchasesLoading } = trpc.hospitals.getPurchases.useQuery(
    { hospitalId: parseInt(selectedHospitalId) },
    { enabled: !!selectedHospitalId }
  );
  const { data: hospitalAreas } = trpc.areas.byHospital.useQuery(
    { hospitalId: parseInt(selectedHospitalId) },
    { enabled: !!selectedHospitalId }
  );

  // Query for excluded purchases
  const { data: excludedPurchases } = trpc.matches.excluded.useQuery();
  
  // Filter excluded purchases by selected hospital
  const hospitalExcludedPurchases = useMemo(() => {
    if (!excludedPurchases || !selectedHospitalId) return [];
    return excludedPurchases.filter(p => p.hospitalId === parseInt(selectedHospitalId));
  }, [excludedPurchases, selectedHospitalId]);

  // Set of excluded purchase IDs for quick lookup
  const excludedPurchaseIds = useMemo(() => {
    if (!hospitalExcludedPurchases) return new Set<number>();
    return new Set(hospitalExcludedPurchases.map(p => p.id));
  }, [hospitalExcludedPurchases]);

  const unexcludePurchase = trpc.matches.unexclude.useMutation({
    onSuccess: () => {
      utils.matches.excluded.invalidate();
      utils.hospitals.getPurchases.invalidate();
      utils.matches.pending.invalidate();
      toast.success("Purchase restored");
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const excludePurchase = trpc.matches.excludeByPurchaseId.useMutation({
    onSuccess: () => {
      utils.matches.excluded.invalidate();
      utils.hospitals.getPurchases.invalidate();
      utils.matches.pending.invalidate();
      toast.success("Purchase excluded");
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const linkToArea = trpc.matches.linkToArea.useMutation({
    onSuccess: () => {
      utils.hospitals.getPurchases.invalidate();
      utils.matches.pending.invalidate();
      toast.success("Purchase linked to area");
      setDialogOpen(false);
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const createAreaAndLink = trpc.matches.createAreaAndLink.useMutation({
    onSuccess: () => {
      utils.hospitals.getPurchases.invalidate();
      utils.areas.byHospital.invalidate();
      utils.matches.pending.invalidate();
      toast.success("New area created and purchase linked");
      setDialogOpen(false);
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const selectedHospital = hospitals?.find(h => h.id.toString() === selectedHospitalId);

  // Handle URL parameter for hospital selection
  useEffect(() => {
    if (hospitalIdFromUrl && hospitals && !selectedHospitalId) {
      const hospital = hospitals.find(h => h.id.toString() === hospitalIdFromUrl);
      if (hospital) {
        setSelectedHospitalId(hospital.id.toString());
        setHospitalSearch(hospital.customerName);
      }
    }
  }, [hospitalIdFromUrl, hospitals, selectedHospitalId]);

  // Filter hospitals based on search input
  const filteredHospitals = useMemo(() => {
    if (!hospitals) return [];
    if (!hospitalSearch.trim()) return hospitals;
    const search = hospitalSearch.toLowerCase();
    return hospitals.filter(h => h.customerName.toLowerCase().includes(search));
  }, [hospitals, hospitalSearch]);

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

  // Combine purchases with excluded status
  const allPurchasesWithStatus = useMemo(() => {
    if (!purchases) return [];
    // Regular purchases (filter out any that are excluded)
    const regularPurchases = purchases
      .filter(p => !excludedPurchaseIds.has(p.id))
      .map(p => ({
        ...p,
        status: p.areaId ? 'matched' as const : 'unmatched' as const,
        isExcluded: false,
      }));
    // Add excluded purchases
    const excludedItems = hospitalExcludedPurchases.map(p => ({
      id: p.id,
      orderNumber: p.orderNumber,
      orderDate: p.orderDate,
      invoiceDate: null as Date | null,
      customerRef: p.customerRef,
      rawAreaText: p.rawAreaText,
      areaId: null,
      areaName: null,
      totalCurtains: 0,
      status: 'excluded' as const,
      isExcluded: true,
    }));
    return [...regularPurchases, ...excludedItems];
  }, [purchases, hospitalExcludedPurchases, excludedPurchaseIds]);

  const filteredPurchases = useMemo(() => {
    return allPurchasesWithStatus.filter(p => {
      const matchesSearch = searchTerm === "" || 
        p.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.customerRef?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.areaName?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesArea = areaFilter === "all" || 
        (areaFilter === "unmatched" && !p.areaId && !p.isExcluded) ||
        (p.areaId?.toString() === areaFilter);
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "matched" && p.status === 'matched') ||
        (statusFilter === "unmatched" && p.status === 'unmatched') ||
        (statusFilter === "excluded" && p.status === 'excluded');
      return matchesSearch && matchesArea && matchesStatus;
    });
  }, [allPurchasesWithStatus, searchTerm, areaFilter, statusFilter]);

  // Filter areas based on input
  const filteredAreas = useMemo(() => {
    if (!hospitalAreas || !areaInput.trim()) return [];
    const search = areaInput.toLowerCase();
    return hospitalAreas.filter(a => a.name.toLowerCase().includes(search)).slice(0, 10);
  }, [hospitalAreas, areaInput]);

  // Check if exact match exists
  const exactMatch = useMemo(() => {
    if (!hospitalAreas || !areaInput.trim()) return null;
    return hospitalAreas.find(a => a.name.toLowerCase() === areaInput.toLowerCase());
  }, [hospitalAreas, areaInput]);

  const handleExport = () => {
    if (!filteredPurchases.length || !selectedHospital) return;
    const csv = [
      ['Order Number', 'Order Date', 'Customer Reference', 'Area', 'Curtains', 'Raw Area Text'].join(','),
      ...filteredPurchases.map(p => [
        `"${p.orderNumber}"`,
        new Date(p.orderDate).toLocaleDateString(),
        `"${p.customerRef || ''}"`,
        `"${p.areaName || 'Unmatched'}"`,
        p.totalCurtains || 0,
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

  const openDialog = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setAreaInput(purchase.areaName || "");
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setDialogOpen(true);
  };

  const handleSelectArea = (areaName: string) => {
    setAreaInput(areaName);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || filteredAreas.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, filteredAreas.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredAreas.length) {
          handleSelectArea(filteredAreas[highlightedIndex].name);
        } else {
          handleConfirm();
        }
        break;
      case 'Tab':
        if (highlightedIndex >= 0 && highlightedIndex < filteredAreas.length) {
          e.preventDefault();
          handleSelectArea(filteredAreas[highlightedIndex].name);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleConfirm = useCallback(() => {
    if (!selectedPurchase || !areaInput.trim()) return;

    if (exactMatch) {
      // Link to existing area
      linkToArea.mutate({ purchaseId: selectedPurchase.id, areaId: exactMatch.id });
    } else {
      // Create new area
      createAreaAndLink.mutate({
        purchaseId: selectedPurchase.id,
        hospitalId: parseInt(selectedHospitalId),
        areaName: areaInput.trim(),
      });
    }
  }, [selectedPurchase, areaInput, exactMatch, selectedHospitalId, linkToArea, createAreaAndLink]);

  const isLoading = linkToArea.isPending || createAreaAndLink.isPending;

  const handleSelectHospital = (hospitalId: string, hospitalName: string) => {
    setSelectedHospitalId(hospitalId);
    setHospitalSearch(hospitalName);
    setShowHospitalDropdown(false);
    setHospitalHighlightedIndex(-1);
    setAreaFilter("all");
    setSearchTerm("");
  };

  const handleHospitalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showHospitalDropdown || filteredHospitals.length === 0) {
      if (e.key === 'Enter' && filteredHospitals.length === 1) {
        e.preventDefault();
        handleSelectHospital(filteredHospitals[0].id.toString(), filteredHospitals[0].customerName);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHospitalHighlightedIndex(prev => Math.min(prev + 1, filteredHospitals.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHospitalHighlightedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (hospitalHighlightedIndex >= 0 && hospitalHighlightedIndex < filteredHospitals.length) {
          const h = filteredHospitals[hospitalHighlightedIndex];
          handleSelectHospital(h.id.toString(), h.customerName);
        } else if (filteredHospitals.length === 1) {
          handleSelectHospital(filteredHospitals[0].id.toString(), filteredHospitals[0].customerName);
        }
        break;
      case 'Tab':
        if (hospitalHighlightedIndex >= 0 && hospitalHighlightedIndex < filteredHospitals.length) {
          e.preventDefault();
          const h = filteredHospitals[hospitalHighlightedIndex];
          handleSelectHospital(h.id.toString(), h.customerName);
        }
        break;
      case 'Escape':
        setShowHospitalDropdown(false);
        setHospitalHighlightedIndex(-1);
        break;
    }
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
            <div className="relative w-full md:w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={hospitalSearch}
                onChange={(e) => {
                  setHospitalSearch(e.target.value);
                  setShowHospitalDropdown(true);
                  setHospitalHighlightedIndex(-1);
                  if (!e.target.value.trim()) {
                    setSelectedHospitalId("");
                  }
                }}
                onFocus={() => setShowHospitalDropdown(true)}
                onBlur={() => setTimeout(() => setShowHospitalDropdown(false), 200)}
                onKeyDown={handleHospitalKeyDown}
                placeholder="Type to search hospitals..."
                className="pl-9"
              />
              
              {/* Hospital Dropdown */}
              {showHospitalDropdown && !hospitalsLoading && filteredHospitals.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredHospitals.map((h, index) => (
                    <div
                      key={h.id}
                      className={`px-3 py-2 cursor-pointer text-sm ${
                        index === hospitalHighlightedIndex ? 'bg-accent' : 'hover:bg-muted'
                      } ${h.id.toString() === selectedHospitalId ? 'font-medium text-primary' : ''}`}
                      onMouseEnter={() => setHospitalHighlightedIndex(index)}
                      onMouseDown={() => handleSelectHospital(h.id.toString(), h.customerName)}
                    >
                      {h.customerName}
                    </div>
                  ))}
                </div>
              )}
              
              {showHospitalDropdown && !hospitalsLoading && hospitalSearch && filteredHospitals.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  No hospitals found matching "{hospitalSearch}"
                </div>
              )}
              
              {hospitalsLoading && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  Loading hospitals...
                </div>
              )}
            </div>
            
            {selectedHospital && (
              <div className="mt-2 text-sm text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{selectedHospital.customerName}</span>
              </div>
            )}
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="matched">Matched</SelectItem>
                      <SelectItem value="unmatched">Unmatched</SelectItem>
                      <SelectItem value="excluded">Excluded</SelectItem>
                    </SelectContent>
                  </Select>
                  <Combobox
                    className="w-full md:w-[250px]"
                    placeholder="All Areas"
                    searchPlaceholder="Search areas..."
                    emptyText="No areas found."
                    value={areaFilter}
                    onValueChange={setAreaFilter}
                    options={[
                      { value: "all", label: "All Areas" },
                      ...purchaseAreas.map(a => ({ value: a.id.toString(), label: a.name }))
                    ]}
                  />
                  {(areaFilter !== 'all' || searchTerm || statusFilter !== 'all') && (
                    <Button variant="ghost" onClick={() => { setAreaFilter('all'); setSearchTerm(''); setStatusFilter('all'); }}>Clear</Button>
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
                          <TableHead>Invoice Date</TableHead>
                          <TableHead>Customer Reference</TableHead>
                          <TableHead>Area</TableHead>
                          <TableHead className="text-center">Curtains</TableHead>
                          <TableHead className="text-center w-[120px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchases.map((purchase) => (
                          <TableRow key={`${purchase.status}-${purchase.id}`}>
                            <TableCell className="font-medium">{purchase.orderNumber}</TableCell>
                            <TableCell>{new Date(purchase.orderDate).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {purchase.invoiceDate ? (
                                new Date(purchase.invoiceDate).toLocaleDateString()
                              ) : (
                                <span className="text-muted-foreground">On Order</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate" title={purchase.customerRef || undefined}>
                              {purchase.customerRef || '-'}
                            </TableCell>
                            <TableCell>
                              {purchase.status === 'excluded' ? (
                                <span className="text-red-500 font-medium">Excluded</span>
                              ) : purchase.areaName ? (
                                <span className="text-green-600">{purchase.areaName}</span>
                              ) : (
                                <span className="text-amber-500 font-medium">Unmatched</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {purchase.totalCurtains > 0 ? purchase.totalCurtains : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-center">
                                {purchase.status === 'excluded' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => unexcludePurchase.mutate({ purchaseId: purchase.id })}
                                    className="h-8 px-2"
                                    disabled={unexcludePurchase.isPending}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Restore
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openDialog(purchase)}
                                      className="h-8 px-2"
                                    >
                                      {purchase.areaId ? (
                                        <>
                                          <Pencil className="h-4 w-4 mr-1" />
                                          Edit
                                        </>
                                      ) : (
                                        <>
                                          <Link2 className="h-4 w-4 mr-1" />
                                          Match
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => excludePurchase.mutate({ purchaseId: purchase.id })}
                                      className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                      disabled={excludePurchase.isPending}
                                    >
                                      <Ban className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
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

      {/* Match/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedPurchase?.areaId ? 'Edit Area Match' : 'Match to Area'}</DialogTitle>
            <DialogDescription>
              Type an area name. Matching existing areas will appear as you type.
            </DialogDescription>
          </DialogHeader>

          {selectedPurchase && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">Original Reference:</div>
                <div className="text-muted-foreground">{selectedPurchase.customerRef || selectedPurchase.rawAreaText || 'N/A'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedPurchase.orderNumber} • {new Date(selectedPurchase.orderDate).toLocaleDateString()}
                </div>
              </div>

              {/* Naming Convention Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-blue-800 mb-1">Area Naming Convention:</div>
                <ol className="text-blue-700 text-xs space-y-0.5 list-decimal list-inside">
                  <li>Where (town)</li>
                  <li>What (department/function)</li>
                  <li>Location (building/level)</li>
                  <li>Sub-location (room number)</li>
                </ol>
              </div>

              {/* Area Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Area Name</label>
                <div className="relative">
                  <Input
                    value={areaInput}
                    onChange={(e) => {
                      setAreaInput(e.target.value);
                      setShowSuggestions(true);
                      setHighlightedIndex(-1);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Type area name..."
                    autoFocus
                  />
                  
                  {/* Suggestions Dropdown */}
                  {showSuggestions && filteredAreas.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-52 overflow-auto">
                      {filteredAreas.map((area, index) => (
                        <div
                          key={area.id}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === highlightedIndex ? 'bg-accent' : 'hover:bg-muted'
                          }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onMouseDown={() => handleSelectArea(area.name)}
                        >
                          {area.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status Indicator */}
                {areaInput.trim() && (
                  <div className="text-xs">
                    {exactMatch ? (
                      <span className="text-green-600">✓ Will link to existing area: {exactMatch.name}</span>
                    ) : (
                      <span className="text-blue-600">+ Will create new area: {areaInput.trim()}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleConfirm} 
              disabled={!areaInput.trim() || isLoading}
            >
              {isLoading ? 'Saving...' : (exactMatch ? 'Link to Area' : 'Create & Link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
