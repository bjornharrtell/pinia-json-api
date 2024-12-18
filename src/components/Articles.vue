<script setup lang="ts">

import { onMounted, shallowRef } from 'vue';
import { Article, useArticlesStore } from '../stores/articles';

const articlesStore = useArticlesStore()

const articles = shallowRef<Article[]>([])

onMounted(async () => {
  articles.value = await articlesStore.findAll(Article)
  await articlesStore.findRelated(articles.value[0], 'comments')
  await articlesStore.findRelated(articles.value[0], 'author')
})

</script>

<template>
  <h2>Articles</h2>
  <div v-for="article in articles">
    <h3>{{ article.title }}<i v-if="article.author"> (by {{ article.author.firstName }} {{ article.author.lastName }})</i></h3>
    <h7 v-if="article.comments">Comments:</h7>
    <ul>
      <li v-for="comment in article.comments">{{ comment.body }}</li>
    </ul>
  </div>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}
</style>
