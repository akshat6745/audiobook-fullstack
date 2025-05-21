import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { apiMetrics, logTtsMetrics } from '../services/api';
import { Ionicons } from '@expo/vector-icons';

interface ApiMonitorProps {
  visible: boolean;
  onClose: () => void;
}

const ApiMonitor: React.FC<ApiMonitorProps> = ({ visible, onClose }) => {
  const [metrics, setMetrics] = useState(apiMetrics.getCallsSummary());
  const [recentCalls, setRecentCalls] = useState<typeof apiMetrics.ttsCallHistory>([]);
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Update metrics every time the component is shown and when refreshed
  useEffect(() => {
    if (visible) {
      updateMetrics();
    }
  }, [visible, refreshCounter]);
  
  const updateMetrics = () => {
    setMetrics(apiMetrics.getCallsSummary());
    // Get the most recent 50 calls, reversed so newest is first
    setRecentCalls([...apiMetrics.getCallHistory()].reverse().slice(0, 50));
  };
  
  const handleRefresh = () => {
    updateMetrics();
    setRefreshCounter(prev => prev + 1);
  };
  
  const handleReset = () => {
    apiMetrics.resetCounters();
    updateMetrics();
  };
  
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  };
  
  if (!visible) return null;
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>API Monitor</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.metricsContainer}>
          <Text style={styles.metricsTitle}>TTS API Calls</Text>
          
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{metrics.totalCalls}</Text>
              <Text style={styles.metricLabel}>Total</Text>
            </View>
            
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{metrics.callsIn5Min}</Text>
              <Text style={styles.metricLabel}>Last 5m</Text>
            </View>
            
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{metrics.callsIn1Hour}</Text>
              <Text style={styles.metricLabel}>Last 1h</Text>
            </View>
            
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{(metrics.successRate * 100).toFixed(0)}%</Text>
              <Text style={styles.metricLabel}>Success</Text>
            </View>
          </View>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleRefresh}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.buttonText}>Refresh</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionButton, styles.resetButton]} onPress={handleReset}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.buttonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>Recent API Calls</Text>
        
        <ScrollView style={styles.callsContainer}>
          {recentCalls.map((call, index) => (
            <View key={index} style={styles.callItem}>
              <View style={styles.callHeader}>
                <Text style={styles.callIndex}>Call #{apiMetrics.getCallCount() - index}</Text>
                <Text style={styles.callTime}>{formatTimestamp(call.timestamp)}</Text>
                {call.success !== undefined && (
                  <View style={[styles.statusIndicator, call.success ? styles.successStatus : styles.failedStatus]} />
                )}
              </View>
              
              <View style={styles.callDetails}>
                <Text style={styles.callText}>
                  <Text style={styles.callLabel}>Voice:</Text> {call.voice}
                </Text>
                <Text style={styles.callText}>
                  <Text style={styles.callLabel}>Length:</Text> {call.textLength} chars
                </Text>
                <Text style={styles.callText}>
                  <Text style={styles.callLabel}>Paragraph:</Text> {call.paragraph >= 0 ? call.paragraph : 'N/A'}
                </Text>
                {call.duration && (
                  <Text style={styles.callText}>
                    <Text style={styles.callLabel}>Duration:</Text> {call.duration}ms
                  </Text>
                )}
              </View>
            </View>
          ))}
          
          {recentCalls.length === 0 && (
            <Text style={styles.emptyText}>No API calls recorded yet</Text>
          )}
        </ScrollView>
        
        {/* Back button at the bottom */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={onClose}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
          <Text style={styles.backButtonText}>Back to Audiobook</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 5,
  },
  metricsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  metricsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  resetButton: {
    backgroundColor: '#dc3545',
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 12,
    color: '#333',
  },
  callsContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  callItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  callIndex: {
    fontWeight: 'bold',
    color: '#333',
  },
  callTime: {
    color: '#666',
    fontSize: 12,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  successStatus: {
    backgroundColor: '#28a745',
  },
  failedStatus: {
    backgroundColor: '#dc3545',
  },
  callDetails: {
    backgroundColor: '#f9f9f9',
    padding: 8,
    borderRadius: 6,
  },
  callText: {
    fontSize: 12,
    marginBottom: 4,
    color: '#333',
  },
  callLabel: {
    fontWeight: 'bold',
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    padding: 20,
    fontStyle: 'italic',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  backButtonText: {
    color: 'white',
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ApiMonitor; 