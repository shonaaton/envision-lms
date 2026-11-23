import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Public view counter for one blog post.
 *
 * One document per post slug holding a running total, so reading every card's
 * count on /blog is a single small query. Nothing about the reader is stored:
 * no IP, no user agent, no account. Repeat views from the same browser within a
 * day are dropped in the browser (see BlogViews.tsx), and the API rate-limits
 * per address, so the number tracks readers rather than refreshes.
 */
const BlogPostViewSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    views: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export type BlogPostViewDoc = InferSchemaType<typeof BlogPostViewSchema>;
export const BlogPostView = models.BlogPostView || model("BlogPostView", BlogPostViewSchema);
