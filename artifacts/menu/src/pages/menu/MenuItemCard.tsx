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
      borderRadius: "14px",
      border: "1px solid #ede8e3",
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>

      {/* Left: veg/non-veg colour stripe — 3px, full card height */}
      <div style={{ width: "3px", flexShrink: 0, backgroundColor: dotColor }} />

      {/* Center: content column */}
      <div style={{
        flex: "1 1 0%",
        minWidth: "0px",
        padding: "12px 10px 12px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "8px",
      }}>

        {/* Top: indicator + name + description */}
        <div>
          {/* Veg / non-veg indicator + name */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "3px" }}>
            <div style={{
              marginTop: "2px",
              width: "13px", height: "13px",
              flexShrink: 0,
              borderRadius: "3px",
              border: `2px solid ${dotColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: dotColor }} />
            </div>

            <p style={{
              flex: 1,
              fontWeight: 700, fontSize: "14px", color: "#111827",
              lineHeight: "1.35",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {item.name}
            </p>
          </div>

          {item.description && (
            <p style={{
              fontSize: "12px", color: "#6b7280",
              lineHeight: "1.4",
              marginLeft: "19px",
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
          gap: "8px",
        }}>
          <span style={{ fontWeight: 800, fontSize: "15px", color: "#1a0a00", flexShrink: 0 }}>
            ₹{item.price}
          </span>

          {qty === 0 ? (
            <button
              onClick={onAdd}
              style={{
                flexShrink: 0,
                padding: "5px 18px",
                borderRadius: "8px",
                border: "1.5px solid #c2410c",
                color: "#c2410c",
                backgroundColor: "transparent",
                fontWeight: 700, fontSize: "12px",
                letterSpacing: "0.04em",
              }}
            >
              ADD
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center",
              backgroundColor: "#fff3ed",
              borderRadius: "8px",
              border: "1.5px solid #fed7aa",
              flexShrink: 0,
            }}>
              <button
                onClick={onRemove}
                aria-label="Remove one"
                style={{
                  width: "30px", height: "30px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#c2410c",
                }}
              >
                <Minus style={{ width: "13px", height: "13px" }} />
              </button>
              <span style={{
                width: "22px", textAlign: "center",
                fontWeight: 800, fontSize: "14px", color: "#7c2d12",
              }}>
                {qty}
              </span>
              <button
                onClick={onAdd}
                aria-label="Add one"
                style={{
                  width: "30px", height: "30px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "#ea580c", color: "#fff",
                  borderRadius: "0 6px 6px 0",
                }}
              >
                <Plus style={{ width: "13px", height: "13px" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: 90×90 image, centred vertically */}
      {hasImage ? (
        <div style={{
          width: "90px", height: "90px",
          flexShrink: 0,
          alignSelf: "center",
          margin: "0 10px 0 0",
          borderRadius: "10px",
          overflow: "hidden",
        }}>
          <img
            src={item.imageUrl!}
            alt={item.name}
            style={{ width: "90px", height: "90px", objectFit: "cover", display: "block" }}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : null}
    </div>
  );
}
