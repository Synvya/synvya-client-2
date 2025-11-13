import { SquareEventTemplate } from "@/services/square";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Tag, DollarSign, Image as ImageIcon } from "lucide-react";

interface PublicationPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: SquareEventTemplate[];
  pendingCount: number;
  totalEvents: number;
}

function extractTagValue(tags: string[][], tagName: string): string | null {
  const tag = tags.find((t) => Array.isArray(t) && t.length >= 2 && t[0] === tagName);
  return tag && tag[1] ? tag[1] : null;
}

function extractTagValues(tags: string[][], tagName: string): string[] {
  return tags
    .filter((t) => Array.isArray(t) && t.length >= 2 && t[0] === tagName)
    .map((t) => t[1])
    .filter((v): v is string => Boolean(v));
}

function formatPrice(priceTag: string[], currency?: string): string | null {
  if (!priceTag || priceTag.length < 2) return null;
  const amount = priceTag[1];
  const curr = currency || priceTag[2] || "USD";
  try {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
    }).format(numAmount);
  } catch {
    return `${amount} ${curr}`;
  }
}

export function PublicationPreview({
  open,
  onOpenChange,
  events,
  pendingCount,
  totalEvents,
}: PublicationPreviewProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview Publication</DialogTitle>
          <DialogDescription>
            {pendingCount === 0
              ? "No new listings to publish. All items are up to date."
              : `Previewing ${pendingCount} of ${totalEvents} listing${pendingCount === 1 ? "" : "s"} ready to publish.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No listings to preview.</p>
            </div>
          ) : (
            events.map((event, index) => {
              const title = extractTagValue(event.tags, "title");
              const summary = extractTagValue(event.tags, "summary");
              const location = extractTagValue(event.tags, "location");
              const images = extractTagValues(event.tags, "image");
              const priceTag = event.tags.find((t) => Array.isArray(t) && t[0] === "price");
              const price = priceTag ? formatPrice(priceTag) : null;
              const categories = extractTagValues(event.tags, "t");

              return (
                <div
                  key={index}
                  className="rounded-lg border bg-card p-4 space-y-3 shadow-sm"
                >
                  {title && (
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                  )}

                  {images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {images.map((imgUrl, imgIndex) => (
                        <img
                          key={imgIndex}
                          src={imgUrl}
                          alt={title || `Listing image ${imgIndex + 1}`}
                          className="h-32 w-32 object-cover rounded-md border flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {summary && (
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  )}

                  {event.content && (
                    <div className="text-sm text-foreground whitespace-pre-wrap">
                      {event.content.split("\n").map((line, lineIndex) => {
                        if (line.startsWith("**") && line.endsWith("**")) {
                          return (
                            <p key={lineIndex} className="font-semibold mb-1">
                              {line.slice(2, -2)}
                            </p>
                          );
                        }
                        return <p key={lineIndex}>{line}</p>;
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t">
                    {price && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-medium text-foreground">{price}</span>
                      </div>
                    )}

                    {location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        <span>{location}</span>
                      </div>
                    )}

                    {categories.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Tag className="h-4 w-4" />
                        <div className="flex gap-1.5 flex-wrap">
                          {categories.map((cat, catIndex) => (
                            <span
                              key={catIndex}
                              className="px-2 py-0.5 rounded-md bg-muted text-xs"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

