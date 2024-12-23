<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { Article, useArticlesStore } from '../stores/articles.ts'

const articlesStore = useArticlesStore()

const articles = shallowRef<InstanceType<typeof Article>[]>([])

onMounted(async () => {
  const { records } = await articlesStore.findAll(Article)
  articles.value = records
})
</script>

<template>
  <h2>Articles</h2>
  <div v-for="article in articles">
    <h3>{{ article.title }}<i v-if="article.author"> (by {{ article.author.firstName }} {{ article.author.lastName }})</i></h3>
    <h7 v-if="article.comments">Comments</h7>
    <ul>
      <li v-for="comment in article.comments">{{ comment.body }}</li>
    </ul>
  </div>
</template>

