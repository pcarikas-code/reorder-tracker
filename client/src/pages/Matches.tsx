import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, X, ChevronRight, Ban } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

export default function Matches() {
  const utils = trpc.useUtils();
  const { data: pendingMatches, isLoading } = trpc.matches.pending.useQuery();
  const { data: areas } = trpc.areas.list.useQuery();

  const [selectedMatch, setSelectedMatch] = useState<NonNullable<typeof pendingMatches>[number] | null>(null);
  const [areaInput, setAreaInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [goToNextAfterConfirm, setGoToNextAfterConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmMatch = trpc.matches.confirm.useMutation({
    onSuccess: () => {
      toast.success("Match confirmed");
      utils.matches.pending.invalidate();
      utils.reorders.statuses.invalidate();
      if (goToNextAfterConfirm) {
        goToNextMatch();
      } else {
        closeDialog();
      }
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const createNewArea = trpc.matches.createNewArea.useMutation({
    onSuccess: () => {
      toast.success("New area created and matched");
      utils.matches.pending.invalidate();
      utils.areas.list.invalidate();
      utils.reorders.statuses.invalidate();
      if (goToNextAfterConfirm) {
        goToNextMatch();
      } else {
        closeDialog();
      }
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const rejectMatch = trpc.matches.reject.useMutation({
    onSuccess: () => {
      toast.success("Match rejected");
      utils.matches.pending.invalidate();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  const excludeMatch = trpc.matches.exclude.useMutation({
    onSuccess: () => {
      toast.success("Order excluded - it won't appear again");
      utils.matches.pending.invalidate();
      goToNextMatch();
    },
    onError: (error) => toast.error(`Failed: ${error.message}`),
  });

  // Get areas for the current hospital
  const hospitalAreas = useMemo(() => {
    if (!selectedMatch || !areas) return [];
    const hospitalId = (selectedMatch as any)?.hospitalId;
    return areas.filter(a => a.hospitalId === hospitalId).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedMatch, areas]);

  // Filter areas based on input
  const filteredAreas = useMemo(() => {
    if (!areaInput.trim()) return hospitalAreas;
    const search = areaInput.toLowerCase().trim();
    return hospitalAreas.filter(a => a.name.toLowerCase().includes(search));
  }, [hospitalAreas, areaInput]);

  // Check if there's an exact match
  const exactMatch = useMemo(() => {
    if (!areaInput.trim()) return null;
    const search = areaInput.toLowerCase().trim();
    return hospitalAreas.find(a => a.name.toLowerCase() === search);
  }, [hospitalAreas, areaInput]);

  // Determine if this will create a new area
  const isNewArea = areaInput.trim() && !exactMatch && filteredAreas.length === 0;

  const closeDialog = () => {
    setSelectedMatch(null);
    setAreaInput("");
    setShowSuggestions(false);
    setGoToNextAfterConfirm(false);
  };

  const goToNextMatch = () => {
    if (!pendingMatches || !selectedMatch) {
      closeDialog();
      return;
    }
    
    const currentIndex = pendingMatches.findIndex(m => m.id === selectedMatch.id);
    const nextMatch = currentIndex >= 0 && currentIndex < pendingMatches.length - 1 
      ? pendingMatches[currentIndex + 1] 
      : null;
    
    setAreaInput("");
    setShowSuggestions(false);
    setGoToNextAfterConfirm(false);
    
    if (nextMatch) {
      openDialog(nextMatch);
    } else {
      closeDialog();
      toast.info("All matches processed!");
    }
  };

  const openDialog = (match: NonNullable<typeof pendingMatches>[number]) => {
    setSelectedMatch(match);
    setAreaInput(match.rawAreaText || "");
    setShowSuggestions(false);
    // Focus input after dialog opens
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelectArea = (areaName: string) => {
    setAreaInput(areaName);
    setShowSuggestions(false);
  };

  const handleConfirm = (goToNext: boolean = false) => {
    if (!selectedMatch || !areaInput.trim()) return;
    setGoToNextAfterConfirm(goToNext);
    
    if (exactMatch) {
      // Link to existing area
      confirmMatch.mutate({
        matchId: selectedMatch.id,
        areaId: exactMatch.id,
      });
    } else {
      // Create new area
      const hospitalId = (selectedMatch as any)?.hospitalId;
      if (!hospitalId) {
        toast.error("Hospital not found");
        return;
      }
      createNewArea.mutate({
        matchId: selectedMatch.id,
        hospitalId: hospitalId,
        areaName: areaInput.trim(),
      });
    }
  };

  const canConfirm = () => {
    return areaInput.trim().length > 0;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedMatch) return;
      
      // Enter to confirm (when not in suggestions dropdown)
      if (e.key === 'Enter' && !showSuggestions && canConfirm() && !confirmMatch.isPending && !createNewArea.isPending) {
        e.preventDefault();
        handleConfirm(true);
      }
      
      // Escape to close suggestions or dialog
      if (e.key === 'Escape') {
        if (showSuggestions) {
          setShowSuggestions(false);
        } else {
          closeDialog();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMatch, showSuggestions, canConfirm, confirmMatch.isPending, createNewArea.isPending]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Matches</h1>
          <p className="text-muted-foreground">Review and confirm area name matches from orders</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unmatched Orders ({pendingMatches?.length || 0})
            </CardTitle>
            <CardDescription>
              These orders have area names that couldn't be automatically matched. Review and confirm the correct area or create a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !pendingMatches?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>All orders have been matched!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingMatches.map((match) => (
                  <div key={match.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="font-medium truncate">{match.rawAreaText || "No area text"}</div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {(match as any).hospitalName || 'Unknown Hospital'}
                          </Badge>
                          <span className="text-xs">Order: {(match as any).orderNumber || `#${match.purchaseId}`}</span>
                          {(match as any).orderDate && (
                            <span className="text-xs">
                              {new Date((match as any).orderDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(match as any).customerRef && (
                          <div className="text-xs text-muted-foreground/70 truncate max-w-md" title={(match as any).customerRef}>
                            Ref: {(match as any).customerRef}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openDialog(match)}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rejectMatch.mutate({ matchId: match.id })}
                        title="Reject - not an area"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Simplified Resolve Match Dialog */}
        <Dialog open={!!selectedMatch} onOpenChange={(open) => { if (!open) closeDialog(); }}>
          <DialogContent className="!max-w-2xl !w-[90vw] !min-h-[450px]">
            <DialogHeader>
              <DialogTitle>Resolve Match</DialogTitle>
              <DialogDescription>
                Type an area name. Matching existing areas will appear as you type.
              </DialogDescription>
            </DialogHeader>
            
            {/* Show original reference for context */}
            {(selectedMatch as any)?.customerRef && (
              <div className="p-3 bg-slate-50 border rounded-lg text-sm">
                <div className="text-xs text-muted-foreground mb-1">Original Reference:</div>
                <div className="font-mono text-xs break-all">{(selectedMatch as any).customerRef}</div>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <span>{(selectedMatch as any).hospitalName}</span>
                  <span>•</span>
                  <span>{(selectedMatch as any).orderNumber}</span>
                </div>
              </div>
            )}

            {/* Single autocomplete input */}
            <div className="space-y-2 mb-4">
              <Label>Area Name</Label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={areaInput}
                  onChange={(e) => {
                    setAreaInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Type area name..."
                  className="w-full"
                />
                
                {/* Suggestions dropdown */}
                {showSuggestions && areaInput.trim() && filteredAreas.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-52 overflow-auto">
                    {filteredAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted text-sm flex items-center justify-between"
                        onClick={() => handleSelectArea(area.name)}
                      >
                        <span>{area.name}</span>
                        {area.name.toLowerCase() === areaInput.toLowerCase().trim() && (
                          <Badge variant="secondary" className="text-xs">exact match</Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Status indicator */}
              <div className="text-sm">
                {areaInput.trim() && (
                  exactMatch ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      Will link to existing area: "{exactMatch.name}"
                    </span>
                  ) : filteredAreas.length > 0 ? (
                    <span className="text-muted-foreground">
                      {filteredAreas.length} matching area{filteredAreas.length !== 1 ? 's' : ''} found - select one or keep typing
                    </span>
                  ) : (
                    <span className="text-blue-600">
                      Will create new area: "{areaInput.trim()}"
                    </span>
                  )
                )}
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button 
                  variant="destructive"
                  onClick={() => selectedMatch && excludeMatch.mutate({ matchId: selectedMatch.id, reason: "Not a curtain order" })}
                  disabled={excludeMatch.isPending || confirmMatch.isPending || createNewArea.isPending}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Exclude
                </Button>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="ghost"
                  onClick={goToNextMatch}
                  disabled={confirmMatch.isPending || createNewArea.isPending || excludeMatch.isPending}
                >
                  Skip
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => handleConfirm(false)} 
                  disabled={!canConfirm() || confirmMatch.isPending || createNewArea.isPending}
                >
                  <Check className="h-4 w-4 mr-2" />
                  {exactMatch ? "Confirm" : "Create"}
                </Button>
                <Button 
                  onClick={() => handleConfirm(true)} 
                  disabled={!canConfirm() || confirmMatch.isPending || createNewArea.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  <ChevronRight className="h-4 w-4" />
                  Next
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
