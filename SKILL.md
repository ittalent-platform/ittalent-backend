---
name: native-drawio-class
description: >-
  Use this skill when creating, updating, analyzing, or fixing native Draw.io (.drawio / .xml)
  UML Class Diagrams. Integrates with the Draw.io MCP server (get_page, set_page, list_pages,
  open_drawio_xml) and enforces perimeter-only border anchoring, zero table piercing, diamond
  arrowhead conventions for entities, compartment width sizing, and collision-free orthogonal routing.
---

# Native Draw.io UML Class Diagram Skill

This skill provides comprehensive instructions, geometric invariants, automation scripts, and
Draw.io MCP workflows for creating, updating, and auditing native Draw.io UML Class Diagrams.

---

## 1. Draw.io MCP Server Workflows

The **Draw.io MCP Server** (`drawio`) must always be used as the primary interface for reading,
writing, and validating diagrams.

### 1.1 Read / Decompress Page
Never manually decompress or parse base64 `.drawio` files. Use `get_page` to retrieve clean `<mxGraphModel>` XML:
```json
call_mcp_tool: {
  "ServerName": "drawio",
  "ToolName": "get_page",
  "Arguments": {
    "path": "/absolute/path/to/diagram.drawio",
    "page": "0"
  }
}
```

### 1.2 Write Page
Write modified `<mxGraphModel>` XML back using `set_page`. It automatically retains the original compression format:
```json
call_mcp_tool: {
  "ServerName": "drawio",
  "ToolName": "set_page",
  "Arguments": {
    "path": "/absolute/path/to/diagram.drawio",
    "page": "0",
    "content": "<mxGraphModel>...</mxGraphModel>"
  }
}
```

### 1.3 Validation & Edge Routing
Verify XML well-formedness and visual correctness with `open_drawio_xml`:
```json
call_mcp_tool: {
  "ServerName": "drawio",
  "ToolName": "open_drawio_xml",
  "Arguments": {
    "content": "<mxGraphModel>...</mxGraphModel>",
    "routing": "libavoid"
  }
}
```

---

## 2. Core Geometric & Structural Invariants

### 2.1 Perimeter-Only Border Anchoring (No Internal Penetration)
- **Prohibited**: Anchoring connectors to internal child `mxCell`s (attribute rows, method rows, or separators). Doing so causes lines to originate or terminate *inside* the table compartment, slicing through text and cell dividers.
- **Required**: Connectors MUST bind exclusively to top-level container swimlane IDs (`source="<container_id>"` and `target="<container_id>"`).
- **Explicit Port Points**: Define precise perimeter attachment coordinates:
  - Left border: `exitX=0` or `entryX=0`
  - Right border: `exitX=1` or `entryX=1`
  - Top border: `exitY=0` or `entryY=0`
  - Bottom border: `exitY=1` or `entryY=1`
  - Center alignment: `exitX=0.5` or `entryX=0.5`

### 2.2 Zero Table Piercing (Obstacle Avoidance)
- **Strict Rule**: No connector line or waypoint may slice through the bounding box of ANY table.
- **Corridor Maintenance**:
  - Horizontal corridors: Maintain at least 30px to 40px of clear space between table rows.
  - Vertical corridors: Maintain at least 40px to 80px of clear space between table columns.
- **Orthogonal Waypoints**: Always specify explicit waypoints (`<Array as="points"><mxPoint x="..." y="..."/></Array>`) traveling purely within empty corridors.
- **Vertical Stacking of Multi-Connected Entities**:
  - If two entities (e.g. `Account` and `Token`) both connect to enums on the left and a central entity (e.g. `User`) on the right, stack them **vertically** (`Account` above, `Token` below).
  - Placing them side-by-side forces cross-cutting lines that slice through adjacent tables.

### 2.3 Arrowhead Styles by Relationship Type

| Relationship Type | Arrow Style (`mxCell style`) | Line Style | Usage Examples |
| :--- | :--- | :--- | :--- |
| **Composition / Aggregation (Entities & Enums)** | `endArrow=diamondThin;endFill=1;endSize=24;` | Solid (`strokeColor=#181818;`) | `Account -> User`, `Token -> User`, `Account -> AuthProvider`, `Token -> AuthTokenType`, `User -> UserRole`, `User -> UserStatus` |
| **Repository Management** | `endArrow=open;endSize=6;` | Dashed (`dashed=1;`) | `AuthRepository -> Account`, `AuthRepository -> Token` (label: `manages`) |
| **Synchronous Service Delegation** | `endArrow=open;endSize=6;` | Solid | `AuthController -> AuthService` (label: `delegates to`), `UsersService -> UsersRepository` (label: `uses`) |
| **Cross-Cutting Middleware / Pipeline** | `endArrow=open;endSize=6;` | Solid | `AuthRouter -> RateLimitMiddleware` (label: `calls`), `AuthRouter -> AuthController` (label: `proceeds`) |
| **DTO / Request / Response Flow** | `endArrow=open;endSize=6;` | Dashed (`dashed=1;`) | `AuthController -> RegisterRequest` (label: `accepts`), `AuthService -> RegisterResponse` (label: `instantiates`), `RegisterResponse -> UserDTO` (label: `contains`) |
| **Exception / Error Throwing** | `endArrow=open;endSize=6;` | Dashed (`dashed=1;`) | `AuthService -> HttpError: 409` (label: `throws`) |

> [!IMPORTANT]
> The composition diamond (`diamondThin;endFill=1;endSize=24;`) represents the "rectangle / diamond" shape in UML. Always use this filled diamond on links between entities and for enum type associations.

### 2.4 Typography, Compartment Sizing & Backgrounds
- **Child Row Sequential Y-Offsets (No Tangled Rows)**: Every child row within a swimlane MUST have an explicit, sequential `y` coordinate in its geometry: `y_i = y_{header} + \sum_{k=0}^{i-1} h_k`. Never omit `y` on child cells, as Draw.io will render all child rows at `y=0`, stacking and tangling all text together at the table header.
- **No Truncated Labels**: Table swimlane width must accommodate the longest member text (e.g. `String password_hash`, `Boolean verificationEmailSent`, `createVerificationToken(...)`) with at least 15px padding.
- **Synchronized Child Widths**: When resizing a parent swimlane, all child rows must have their `width` attribute updated to match the new width.
- **Opaque Label Background**: Every labeled connector MUST specify `labelBackgroundColor=#FFFFFF;` to prevent lines from cutting through text.
- **Deduplicated Labels**: Never keep both an edge `value="..."` and a child `<mxCell style="edgeLabel" value="...">` with duplicate text.
- **Label Offset Separation**: Offset labels along turning connectors (using `relative="1"`, `x="-0.65"`, etc.) so that adjacent parallel lines do not have crowding or colliding labels.
- **Multiplicity Format**: Use clean HTML spans for cardinalities:
  `<span style="font-family: Segoe UI, sans-serif; font-size: 11px;">0..* references (user_id) 1</span>`

---

## 3. Automated Auditing Script

Audit any `.drawio` class diagram using the bundled linter:
```bash
python3 ~/.gemini/config/skills/native-drawio-class/scripts/class_diagram_linter.py <path/to/diagram.drawio>
```

The linter validates 5 strict invariants:
1. `0` overlapping table bounding boxes.
2. `100%` perimeter-only border anchoring (no internal child cell attachments).
3. `0` connector segments piercing table interiors.
4. `0` duplicate child `edgeLabel` cells.
5. All labeled connectors use opaque `labelBackgroundColor=#FFFFFF`.
