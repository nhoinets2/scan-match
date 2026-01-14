# Wardrobe Images Storage Setup

## Problem
Wardrobe item images were previously stored as local file paths (`file:///...`), which only work on the device where they were captured. This prevented images from being accessible across different environments (mobile app, web preview, different devices).

## Solution
Implemented cloud storage for wardrobe images using Supabase Storage. Now all wardrobe item images are automatically uploaded to Supabase Storage and stored as public URLs, making them accessible from any device or environment.

## Setup Instructions

### 1. Create Storage Bucket in Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `wardrobe-images`
   - **Public bucket**: ✅ Enabled (for easy image delivery)
   - **File size limit**: 10 MB
   - **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`
5. Click **Create bucket**

### 2. Run the Migration

Run the SQL migration to set up storage policies:

```bash
# Option 1: Via Supabase Dashboard SQL Editor
# Copy the contents of supabase/migrations/003_wardrobe_images_storage.sql
# Paste into the SQL Editor and run

# Option 2: Via Supabase CLI (if you have it set up)
supabase db push
```

The migration will set up the following policies:
- ✅ Users can upload their own images
- ✅ Users can update their own images
- ✅ Users can delete their own images
- ✅ Anyone can read images (public access)

### 3. Test the Implementation

1. **On Mobile Device**: 
   - Open the app
   - Add a new wardrobe item by taking a photo
   - The image will be uploaded to Supabase Storage automatically
   - Check the console logs for `[Storage] Image uploaded successfully`

2. **On Web Preview**:
   - Log in with the same account
   - Navigate to the Wardrobe tab
   - You should now see all the images from your mobile device! 🎉

3. **Verify in Supabase Dashboard**:
   - Go to Storage → wardrobe-images
   - You should see folders organized by userId
   - Each folder contains the uploaded images

## Technical Details

### File Structure
```
wardrobe-images/
├── {userId-1}/
│   ├── 1642345678_abc123.jpg
│   ├── 1642345890_def456.jpg
│   └── ...
├── {userId-2}/
│   └── ...
```

### Upload Flow
1. User captures/selects an image in `add-item.tsx`
2. Image is analyzed by AI
3. When user clicks "Add to Wardrobe":
   - Image is uploaded to Supabase Storage (`uploadWardrobeImage()`)
   - Cloud URL is returned
   - Wardrobe item is saved to database with cloud URL
4. Images are now accessible from any device!

### Code Changes
- **New**: `src/lib/storage.ts` - Storage helper functions
- **Modified**: `src/app/add-item.tsx` - Upload images before saving
- **New**: `supabase/migrations/003_wardrobe_images_storage.sql` - Storage bucket policies

### Migration for Existing Data

If you have existing wardrobe items with local file paths, you'll need to migrate them. You can either:

1. **Manual cleanup**: Delete old items and re-add them (they'll upload automatically)
2. **Migration script**: Create a script to:
   - Fetch all wardrobe items with local URIs (`file://`, `content://`)
   - Re-upload images to cloud storage
   - Update database records with cloud URLs

## Benefits

✅ **Cross-platform access**: View your wardrobe from mobile, web, or any device
✅ **Data persistence**: Images are safely stored in the cloud
✅ **Easy sharing**: Public URLs make it easy to share wardrobe items
✅ **Better performance**: CDN-backed image delivery
✅ **Scalable**: No local storage limitations

## Troubleshooting

### Images not uploading
- Check console logs for `[Storage]` messages
- Verify the bucket exists and is named exactly `wardrobe-images`
- Check that the bucket is set to PUBLIC
- Verify your Supabase URL and keys are correct in `.env`

### Permission errors
- Make sure the storage policies migration was run successfully
- Check that RLS is enabled on the bucket
- Verify users are authenticated before uploading

### Images not showing on web preview
- Check if the image URLs in the database start with `https://`
- Local file paths (`file://`) won't work - only cloud URLs
- Clear browser cache and reload

## Next Steps

Consider adding:
- Image compression before upload (reduce file sizes)
- Thumbnail generation (for faster grid loading)
- Cleanup job (remove orphaned images)
- Progress indicator during upload
- Retry logic for failed uploads

