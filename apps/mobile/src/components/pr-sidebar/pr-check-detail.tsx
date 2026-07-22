import { ActivityIndicator, ScrollView, Text, View } from 'react-native'

import type { PRCheckRunDetails } from '../../../../desktop/src/shared/types'
import { mobilePrSidebarStyles as styles } from './mobile-pr-sidebar-styles'
import { presentCheckDetail, type CheckDetailJob } from './pr-check-detail-content'

// Per-check lazily-fetched detail. `loading`/`error` track the in-flight fetch;
// `details` (once set) is the cache so collapse/re-expand never re-fetches.
export type DetailEntry =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; details: PRCheckRunDetails | null }

// Renders the expanded detail for one check: conclusion/title/summary, plus the
// annotations and failed-job/step summary from the github.prCheckDetails payload
// (parity with the desktop ChecksPanel detail). Muted/monochrome and scrollable
// so long CI output never breaks the sidebar layout.
export function PRCheckDetailView({ entry }: { entry: DetailEntry | undefined }) {
  if (!entry || entry.status === 'loading') {
    return (
      <View className={styles.checkDetailArea}>
        <ActivityIndicator colorClassName="accent-muted-foreground" />
      </View>
    )
  }
  if (entry.status === 'error') {
    return (
      <View className={styles.checkDetailArea}>
        <Text className={styles.checkDetailText}>{entry.message}</Text>
      </View>
    )
  }
  if (!entry.details) {
    return (
      <View className={styles.checkDetailArea}>
        <Text className={styles.checkDetailText}>No details available.</Text>
      </View>
    )
  }

  const content = presentCheckDetail(entry.details)
  const isEmpty =
    content.summaryLines.length === 0 &&
    content.annotations.length === 0 &&
    content.jobs.length === 0

  return (
    <View className={styles.checkDetailArea}>
      {isEmpty ? (
        <Text className={styles.checkDetailText}>No details available.</Text>
      ) : (
        <>
          {content.summaryLines.map((line, index) => (
            <Text key={index} className={styles.checkDetailText}>
              {line}
            </Text>
          ))}
          {content.annotations.length > 0 ? (
            <View className={styles.checkDetailGroup}>
              <Text className={styles.checkDetailGroupLabel}>Annotations</Text>
              {content.annotations.map((annotation, index) => (
                <View key={index}>
                  <Text className={styles.checkDetailLocator} numberOfLines={1}>
                    {annotation.locator}
                    {annotation.level ? ` · ${annotation.level}` : ''}
                  </Text>
                  {annotation.title ? (
                    <Text className={styles.checkDetailEmphasis}>{annotation.title}</Text>
                  ) : null}
                  <Text className={styles.checkDetailText}>{annotation.message}</Text>
                </View>
              ))}
              {content.annotationsTruncated ? (
                <Text className={styles.checkDetailText}>Showing first 20 annotations</Text>
              ) : null}
            </View>
          ) : null}
          {content.jobs.length > 0 ? (
            <View className={styles.checkDetailGroup}>
              <Text className={styles.checkDetailGroupLabel}>{content.jobsLabel}</Text>
              {content.jobs.map((job, index) => (
                <JobRow key={index} job={job} />
              ))}
              {content.jobsTruncated ? (
                <Text className={styles.checkDetailText}>Showing first 100 jobs</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

function JobRow({ job }: { job: CheckDetailJob }) {
  return (
    <View>
      <View className={styles.checkDetailStepRow}>
        <Text className={styles.checkDetailEmphasis} numberOfLines={1}>
          {job.name}
        </Text>
        <Text className={styles.checkDetailText}>{job.state}</Text>
      </View>
      {job.failedSteps.map((step, index) => (
        <View key={index} className={styles.checkDetailStepRow}>
          <Text className={styles.checkDetailText} numberOfLines={1}>
            {step.name}
          </Text>
          <Text className={styles.checkDetailText}>{step.state}</Text>
        </View>
      ))}
      {job.logTail ? (
        <ScrollView className={styles.checkDetailLogScroll} nestedScrollEnabled>
          <Text className={styles.checkDetailLogText}>{job.logTail}</Text>
        </ScrollView>
      ) : null}
    </View>
  )
}
