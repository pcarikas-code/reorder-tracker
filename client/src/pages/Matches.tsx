import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, X, ChevronRight, Ban, Sparkles, Link as LinkIcon, Plus } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { OrderLink } from "@/components/OrderLink";

type Suggestion = {
  type: 'existing' | 'new';
  areaId?: number;
  areaName: string;
  confidence: number;
} | null;

export default function Matches() {
  const utils = trpc.useUtils();
  const { data: pendingMatches, isLoading } = trpc.matches.pending.useQuery();
  const { data: areas } = trpc.areas.list.useQuery();
  const { data: suggestions } = trpc.matches.getSuggestions.useQuery();

  const [selectedMatch, setSelectedMatch] = useState<NonNullable<typeof pendingMatches>[number] | null>(null);
  const [areaInput, setAreaInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [goToNextAfterConfirm, setGoToNextAfterConfirm] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const confirmMatch = trpc.matches.confirm.useMutation({
    onSuccess: () => {
      toast.success("Match confirmed");
      utils.matches.pending.invalidate();
      utils.matches.getSuggestions.invalidate();
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
      utils.matches.getSuggestions.invalidate();
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

  const excludeMatch = trpc.matches.exclude.useMutation({
    onSuccess: () => {
      toast.success("Order excluded - it won't appear again");
      utils.matches.pending.invalidate();
      utils.matches.getSuggestions.invalidate();
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

  // Get suggestion for current match
  const currentSuggestion = useMemo((): Suggestion => {
    if (!selectedMatch || !suggestions) return null;
    return suggestions[selectedMatch.id] || null;
  }, [selectedMatch, suggestions]);

  const closeDialog = () => {
    setSelectedMatch(null);
    setAreaInput("");
    setShowSuggestions(false);
    setGoToNextAfterConfirm(false);
    setHighlightedIndex(-1);
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
    setHighlightedIndex(-1);
    
    if (nextMatch) {
      openDialog(nextMatch);
    } else {
      closeDialog();
      toast.info("All matches processed!");
    }
  };

  const openDialog = (match: NonNullable<typeof pendingMatches>[number]) => {
    setSelectedMatch(match);
    // Pre-fill with suggestion if available
    const suggestion = suggestions?.[match.id];
    if (suggestion?.areaName) {
      setAreaInput(suggestion.areaName);
    } else {
      setAreaInput(match.rawAreaText || "");
    }
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    // Focus input after dialog opens
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelectArea = (areaName: string) => {
    setAreaInput(areaName);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  // Apply suggestion to input
  const applySuggestion = (suggestion: Suggestion) => {
    if (suggestion?.areaName) {
      setAreaInput(suggestion.areaName);
      setShowSuggestions(false);
    }
  };

  // Handle keyboard navigation in input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || filteredAreas.length === 0) {
      // If no suggestions visible, Enter confirms
      if (e.key === 'Enter' && canConfirm() && !confirmMatch.isPending && !createNewArea.isPending) {
        e.preventDefault();
        handleConfirm(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredAreas.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredAreas.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredAreas.length) {
          handleSelectArea(filteredAreas[highlightedIndex].name);
        } else if (canConfirm() && !confirmMatch.isPending && !createNewArea.isPending) {
          handleConfirm(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        if (highlightedIndex >= 0 && highlightedIndex < filteredAreas.length) {
          e.preventDefault();
          handleSelectArea(filteredAreas[highlightedIndex].name);
        }
        break;
    }
  };

  const handleConfirm = (goToNext: boolean = false) => {
    if (!selectedMatch || !areaInput.trim()) return;
    setGoToNextAfterConfirm(goToNext);
    
    if (exactMatch) {
      // Link to existing area
      confirmMatch.mutate({
        purchaseId: selectedMatch.id,
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
        purchaseId: selectedMatch.id,
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

  // Get suggestion badge color based on confidence
  const getSuggestionBadgeVariant = (suggestion: Suggestion): "default" | "secondary" | "outline" => {
    if (!suggestion) return "outline";
    if (suggestion.type === 'existing' && suggestion.confidence >= 80) return "default";
    if (suggestion.type === 'existing' && suggestion.confidence >= 60) return "secondary";
    return "outline";
  };

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
                {pendingMatches.map((match) => {
                  const suggestion = suggestions?.[match.id];
                  return (
                    <div key={match.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="font-medium truncate">{match.rawAreaText || "No area text"}</div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="font-normal">
                              {(match as any).hospitalName || 'Unknown Hospital'}
                            </Badge>
                            <OrderLink 
                                orderNumber={(match as any).orderNumber || `#${match.purchaseId}`}
                                unleashOrderGuid={(match as any).unleashOrderGuid}
                                className="text-xs"
                              />
                            {(match as any).orderDate && (
                              <span className="text-xs">
                                {new Date((match as any).orderDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {/* Show suggestion inline */}
                          {suggestion && (
                            <div className="flex items-center gap-2 mt-1">
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              <span className="text-xs">
                                {suggestion.type === 'existing' ? (
                                  <span className="text-green-600">
                                    Suggested: <strong>{suggestion.areaName}</strong> ({suggestion.confidence}% match)
                                  </span>
                                ) : (
                                  <span className="text-blue-600">
                                    Suggest creating: <strong>{suggestion.areaName}</strong>
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => excludeMatch.mutate({ purchaseId: match.id })}
                          title="Exclude - this order won't appear in pending matches or reorder tracking"
                          disabled={excludeMatch.isPending}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Exclude
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => openDialog(match)}
                        >
                          Resolve
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground items-center">
                  <span>{(selectedMatch as any).hospitalName}</span>
                  <span>•</span>
                  <OrderLink 
                    orderNumber={(selectedMatch as any).orderNumber}
                    unleashOrderGuid={(selectedMatch as any).unleashOrderGuid}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* Suggestion banner */}
            {currentSuggestion && (
              <div className={`p-3 border rounded-lg text-sm flex items-center justify-between ${
                currentSuggestion.type === 'existing' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Sparkles className={`h-4 w-4 ${
                    currentSuggestion.type === 'existing' ? 'text-green-600' : 'text-blue-600'
                  }`} />
                  <span>
                    {currentSuggestion.type === 'existing' ? (
                      <>
                        <span className="text-green-700">Suggested match: </span>
                        <strong className="text-green-800">{currentSuggestion.areaName}</strong>
                        <Badge variant={getSuggestionBadgeVariant(currentSuggestion)} className="ml-2 text-xs">
                          {currentSuggestion.confidence}% confidence
                        </Badge>
                      </>
                    ) : (
                      <>
                        <span className="text-blue-700">No existing match found. Suggest creating: </span>
                        <strong className="text-blue-800">{currentSuggestion.areaName}</strong>
                      </>
                    )}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => applySuggestion(currentSuggestion)}
                  className={currentSuggestion.type === 'existing' ? 'text-green-700 hover:text-green-800' : 'text-blue-700 hover:text-blue-800'}
                >
                  {currentSuggestion.type === 'existing' ? (
                    <>
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Use
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3 mr-1" />
                      Use
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Naming convention guide */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 mb-3">
              <div className="font-medium mb-1">Area Naming Convention:</div>
              <ol className="list-decimal list-inside space-y-0.5">
                <li><strong>Where</strong> (town)</li>
                <li><strong>What</strong> (department name or function)</li>
                <li><strong>Location</strong> (building name or level or both)</li>
                <li><strong>Sub-location</strong> (room number)</li>
              </ol>
            </div>

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
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type area name..."
                  className="w-full"
                />
                
                {/* Suggestions dropdown */}
                {showSuggestions && areaInput.trim() && filteredAreas.length > 0 && (
                  <div ref={suggestionsRef} className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-52 overflow-auto">
                    {filteredAreas.map((area, index) => (
                      <button
                        key={area.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between ${index === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                        onClick={() => handleSelectArea(area.name)}
                        onMouseEnter={() => setHighlightedIndex(index)}
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
                  onClick={() => selectedMatch && excludeMatch.mutate({ purchaseId: selectedMatch.id, reason: "Not a curtain order" })}
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
