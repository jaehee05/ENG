import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAgoxOQ-HzM9dvCGeI92AmjAHYQjHLe8Do',
  authDomain: 'engh-c5082.firebaseapp.com',
  projectId: 'engh-c5082',
  storageBucket: 'engh-c5082.firebasestorage.app',
  messagingSenderId: '838061175359',
  appId: '1:838061175359:web:2af823977e03cd7db33e8a',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
