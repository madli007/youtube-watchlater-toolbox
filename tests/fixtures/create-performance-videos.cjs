"use strict";

function createPerformanceVideos(count = 5000) {
  return Array.from({ length: count }, (_, index) => {
    const channelIndex = index % 250;
    const seriesIndex = Math.floor(index / 2) % 50;
    const episode = index % 2 + 1;
    return {
      videoId: `performance-${index}`,
      index: index + 1,
      title: `Program topic${seriesIndex} Episode ${episode}`,
      channel: `Performance Channel ${channelIndex}`,
      channelUrl: `https://youtube.com/@performance-${channelIndex}`,
      durationSeconds: index % 9 === 0 ? null : 60 + index % 3600,
      uploaded: index % 11 === 0 ? "" : `${index % 800} days ago`,
      viewCountApprox: 1000 + index * 17,
      searchText: `program topic${seriesIndex} performance channel ${channelIndex}`,
      suggestedTags: index % 5 === 0 ? ["longlist"] : [],
      badges: [],
      isUnavailable: index % 97 === 0,
    };
  });
}

module.exports = {
  createPerformanceVideos,
};
