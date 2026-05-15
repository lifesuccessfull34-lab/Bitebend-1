import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { MenuItemData } from "./types";

interface Props {
  item: MenuItemData;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}

const VEG_COLOR = "#16a34a";
const NON_VEG_COLOR = "#dc2626";

export function MenuItemCard({ item, qty, onAdd, onRemove }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = !!item.imageUrl && !imgFailed;
  const dotColor = item.isVeg ? VEG_COLOR : NON_VEG_COLOR;

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      backgroundColor: "#fff",
      borderRadius: "12px",
      border: "1px solid #ede8e3",
      overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>

      {/* Left: veg/non-veg colour stripe — 3px, full card height */}
      <div style={{ width: "3px", flexShrink: 0, backgroundColor: dotColor }} />

      {/* Center: content column */}
      <div style={{
        flex: "1 1 0%",
        minWidth: "0px",
        padding: "10px 8px 10px 10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}>

        {/* Top: indicator + name + description */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
            {/* Veg / non-veg square dot */}
            <div style={{
              width: "12px", height: "12px",
              flexShrink: 0,
              borderRadius: "2px",
              border: `2px solid ${dotColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: dotColor }} />
            </div>

            <p style={{
              flex: 1,
              fontWeight: 700, fontSize: "13.5px", color: "#111827",
              lineHeight: "1.3",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {item.name}
            </p>
          </div>

          {item.description && (
            <p style={{
              fontSize: "11.5px", color: "#6b7280",
              lineHeight: "1.35",
              marginLeft: "17px",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical" as const,
              WebkitLineClamp: 2,
            }}>
              {item.description}
            </p>
          )}
        </div>

        {/* Bottom: price + add / stepper */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "6px",
          gap: "6px",
        }}>
          <span style={{ fontWeight: 800, fontSize: "14px", color: "#111827", flexShrink: 0 }}>
            ₹{item.price}
          </span>

          {qty === 0 ? (
            <button
              onClick={onAdd}
              style={{
                flexShrink: 0,
                padding: "4px 14px",
                borderRadius: "7px",
                border: "1.5px solid #8b4513",
                color: "#8b4513",
                backgroundColor: "transparent",
                fontWeight: 700, fontSize: "12px",
                letterSpacing: "0.02em",
              }}
            >
              ADD
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center",
              backgroundColor: "#f5ede6",
              borderRadius: "7px",
              padding: "2px",
              flexShrink: 0,
            }}>
              <button
                onClick={onRemove}
                aria-label="Remove one"
                style={{
                  width: "26px", height: "26px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#8b4513", borderRadius: "5px",
                }}
              >
                <Minus style={{ width: "12px", height: "12px" }} />
              </button>
              <span style={{
                width: "20px", textAlign: "center",
                fontWeight: 800, fontSize: "13px", color: "#5c2d0e",
              }}>
                {qty}
              </span>
              <button
                onClick={onAdd}
                aria-label="Add one"
                style={{
                  width: "26px", height: "26px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "#8b4513", color: "#fff",
                  borderRadius: "5px",
                }}
              >
                <Plus style={{ width: "12px", height: "12px" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: fixed 82×82 image, centred vertically, rounded */}
      {hasImage ? (
        <div style={{
          width: "82px", height: "82px",
          flexShrink: 0,
          alignSelf: "center",
          margin: "0 8px 0 0",
          borderRadius: "8px",
          overflow: "hidden",
        }}>
          <img
            src={item.imageUrl!}
            alt={item.name}
            style={{ width: "82px", height: "82px", objectFit: "cover", display: "block" }}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : null}
    </div>
  );
}
