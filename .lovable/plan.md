

# Align Front Sales "View Details" Dialog with PM Dashboard Style

## What Changes

The View Details dialog in Front Sales currently uses a different visual style (uppercase `h4` headers, `bg-muted/30` boxes with inline labels). It will be restructured to match the PM dashboard's cleaner format.

## Visual Differences (Current vs Target)

**Current Front Sales style:**
- Uppercase small headers (`h4 font-medium text-sm uppercase`)
- Grouped content inside `bg-muted/30` rounded boxes
- Inline `span` labels with values on same line
- 2-column grid for the top section (Customer + Payment side by side)

**PM dashboard style (target):**
- Section headers with bottom borders (`h3 font-semibold text-lg border-b pb-2`)
- Clean grid layouts without background boxes
- `Label` component for field names, values below on separate line
- Distinct sections: Customer Information, Payment Information, Basic Information, Order Attribution, then type-specific details

## Specific Changes

1. **Dialog width**: Change from `max-w-4xl` to `max-w-2xl` to match PM
2. **Remove** the badges row at top (status + order type) -- PM doesn't have this
3. **Customer Information section**: Use `h3` with `border-b`, 2-column grid with `Label` + `p` pairs, include Customer Domain field, show "N/A" for empty values
4. **Payment Information section**: Use `h3` with `border-b`, 3-column grid with `Label` + colored amounts
5. **Basic Information section**: Title, Business Name, Industry, Website, Deadline, Team/Developer in a 2-column grid with `Label` components
6. **Cancellation Details section**: Add the red-highlighted cancellation/deletion block (matching PM) for cancelled orders
7. **Order Attribution section**: 3-column grid showing Assigned PM, Transferred By, Closed By with `Label` components, plus "Created by" line below
8. **Logo Details section**: Reformat using `h3 border-b` header, grid layout with `Label` components
9. **Website Details section**: Match PM's layout with `Label` components, include logo files rendering
10. **Social Media Post Details**: Add missing sections from PM -- Post Details, Product/Service Info, Design Requirements, Content, Target Audience
11. **Additional Notes section**: Use PM format with `h3 border-b` header
12. **Attachments section**: Match PM's simpler list format with `FilePreview` + download buttons

## Technical Details

### File Modified
- `src/components/dashboards/FrontSalesDashboard.tsx`

### Key Changes
- Replace the entire View Details dialog content (lines 987-1311) with PM-style markup
- Use `Label` component (already imported or will import from `@/components/ui/label`)
- Restructure from `bg-muted/30` boxes to clean grid sections with `border-b` headers
- Add missing fields that PM shows (customer_domain, cancellation details, post details sections)
- Keep Front Sales-specific logic (group key lookup for multi-team orders)

