

## Overview

Enhance the View Details dialog for website orders in the Front Sales Dashboard to display all the fields from the website order form. Currently, the website details section only shows `website_type`, `number_of_pages`, and `website_features` - but it's missing several important fields that are captured during order creation.

## Fields to Add

The following fields from the website order form are currently missing in the view details dialog:

| Field | Database Column | Display Format |
|-------|-----------------|----------------|
| Business Description | `supporting_text` | Multi-line with preserved formatting |
| Video Keywords | `video_keywords` | Multi-line with preserved formatting |
| Additional Notes | `notes_extra_instructions` | Multi-line with preserved formatting |
| Design References | `design_references` | Multi-line with preserved formatting |
| Current Website URL | `website_url` | Clickable link |
| Customer Domain | `customer_domain` | Clickable link |
| Logo Files | `logo_url` | File preview with download |

## Implementation

### 1. Expand Website Details Section (lines ~1007-1016)

Currently the section shows minimal information. It will be restructured to include:

- Industry
- Number of Pages
- Current Website URL (clickable)
- Customer Domain (clickable)
- Video Keywords (with `whitespace-pre-wrap`)

### 2. Add Business Description Section

A new section for the business description (`supporting_text`) with proper text formatting using `whitespace-pre-wrap` to preserve line breaks.

### 3. Add Design References Section

Display the `design_references` field with preserved formatting.

### 4. Add Additional Notes Section

Display `notes_extra_instructions` with `whitespace-pre-wrap` styling, matching other dashboards.

### 5. Add Logo Files Section

If `logo_url` contains uploaded logos, display them with:
- File preview using the existing `FilePreview` component
- Download button functionality (similar to the existing attachments section)

## Technical Details

The changes will be made to `src/components/dashboards/FrontSalesDashboard.tsx` within the View Details Dialog (starting around line 1007).

```text
Structure of enhanced Website Details:

+----------------------------------+
| Website Details                  |
+----------------------------------+
| Industry: [value]                |
| Pages: [value]                   |
| Current Website: [link]          |
| Customer Domain: [link]          |
| Video Keywords:                  |
| [preserved multi-line text]      |
+----------------------------------+

+----------------------------------+
| Business Description             |
+----------------------------------+
| [preserved multi-line text]      |
+----------------------------------+

+----------------------------------+
| Design References                |
+----------------------------------+
| [preserved multi-line text]      |
+----------------------------------+

+----------------------------------+
| Additional Notes                 |
+----------------------------------+
| [preserved multi-line text]      |
+----------------------------------+

+----------------------------------+
| Logo Files                       |
+----------------------------------+
| [File Preview] [File Preview]    |
| [Download]     [Download]        |
+----------------------------------+
```

Key styling: All multi-line text fields will use `whitespace-pre-wrap` class to preserve the original formatting entered in the order form.

