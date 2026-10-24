ALTER TABLE articles ADD COLUMN read_at text;

-- Legacy rows have no trustworthy reading timestamp. Give them seven full days
-- from this migration rather than treating publication/fetch time as reading time.
UPDATE articles
SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE read = 1;

CREATE INDEX articles_retention ON articles(read_at) WHERE read = 1 AND saved = 0;

-- Keep identities only so upstream feeds cannot resurrect removed article content.
CREATE TABLE deleted_articles (
    id text PRIMARY KEY NOT NULL,
    feed_id text NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    deleted_at text NOT NULL
);
CREATE INDEX deleted_articles_feed ON deleted_articles(feed_id);
