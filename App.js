// /workspace/mobile/App.js
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Image, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const API_BASE = 'http://  192.168.0.108:4000'; // Replace with your actual IP'; // change to your LAN IP when testing on device

async function apiRequest(path, method = 'GET', body, token, isForm = false) {
	const headers = {};
	if (!isForm) headers['Content-Type'] = 'application/json';
	if (token) headers['Authorization'] = `Bearer ${token}`;
	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers,
		body: isForm ? body : body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		let msg = 'Request failed';
		try { const data = await res.json(); msg = data.error || msg; } catch {}
		throw new Error(msg);
	}
	return res.json();
}

function useAuth() {
	const [token, setToken] = useState(null);
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			const t = await AsyncStorage.getItem('token');
			if (t) {
				setToken(t);
				try {
					const data = await apiRequest('/me', 'GET', null, t);
					setUser(data.user);
				} catch {
					await AsyncStorage.removeItem('token');
					setToken(null);
				}
			}
			setLoading(false);
		})();
	}, []);

	const login = async (email, password) => {
		const data = await apiRequest('/auth/login', 'POST', { email, password });
		setToken(data.token);
		setUser(data.user);
		await AsyncStorage.setItem('token', data.token);
	};
	const signup = async (name, email, password) => {
		const data = await apiRequest('/auth/signup', 'POST', { name, email, password });
		setToken(data.token);
		setUser(data.user);
		await AsyncStorage.setItem('token', data.token);
	};
	const logout = async () => {
		setToken(null);
		setUser(null);
		await AsyncStorage.removeItem('token');
	};
	return { token, user, loading, login, signup, logout };
}

function LoginScreen({ navigation, route }) {
	const { login } = route.params;
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	return (
		<SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
			<Text style={{ fontSize: 28, fontWeight: '700' }}>Welcome back</Text>
			<TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
			<TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
			<Button title="Log in" onPress={async () => {
				try { await login(email.trim(), password); } catch (e) { Alert.alert('Login failed', e.message); }
			}} />
			<TouchableOpacity onPress={() => navigation.replace('Signup')} style={{ padding: 8 }}>
				<Text>New here? Create an account</Text>
			</TouchableOpacity>
		</SafeAreaView>
	);
}

function SignupScreen({ navigation, route }) {
	const { signup } = route.params;
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	return (
		<SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
			<Text style={{ fontSize: 28, fontWeight: '700' }}>Create account</Text>
			<TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
			<TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
			<TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
			<Button title="Sign up" onPress={async () => {
				try { await signup(name.trim(), email.trim(), password); } catch (e) { Alert.alert('Signup failed', e.message); }
			}} />
			<TouchableOpacity onPress={() => navigation.replace('Login')} style={{ padding: 8 }}>
				<Text>Already have an account? Log in</Text>
			</TouchableOpacity>
		</SafeAreaView>
	);
}

function DesignScreen({ navigation, route }) {
	const { token, logout } = route.params;
	const [itemType, setItemType] = useState('tshirt');
	const [color, setColor] = useState('#ffffff');
	const [style, setStyle] = useState('classic');
	const [text, setText] = useState('');
	const [imageUri, setImageUri] = useState(null);
	const [uploadedUrl, setUploadedUrl] = useState(null);

	const previewStyle = useMemo(() => ({
		width: '100%',
		height: 300,
		borderWidth: 1,
		borderRadius: 12,
		backgroundColor: color,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden'
	}), [color]);

	const pickImage = async () => {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== 'granted') { Alert.alert('Permission required', 'Media library access is needed.'); return; }
		const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
		if (!result.canceled && result.assets?.length) setImageUri(result.assets[0].uri);
	};

	const uploadImage = async () => {
		if (!imageUri) return null;
		const form = new FormData();
		form.append('file', {
			uri: imageUri,
			name: `upload.jpg`,
			type: 'image/jpeg'
		});
		const res = await fetch(`${API_BASE}/upload`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: form
		});
		if (!res.ok) { const txt = await res.text(); throw new Error(txt || 'Upload failed'); }
		const data = await res.json();
		setUploadedUrl(`${API_BASE}${data.url}`);
		return data.url;
	};

	const saveDesign = async () => {
		try {
			let imageUrlPath = null;
			if (imageUri && !uploadedUrl) {
				const uploaded = await uploadImage();
				imageUrlPath = uploaded;
			} else if (uploadedUrl) {
				imageUrlPath = uploadedUrl.replace(API_BASE, '');
			}
			await apiRequest('/designs', 'POST', { itemType, color, style, text, imageUrl: imageUrlPath }, token);
			Alert.alert('Saved', 'Design saved to your library.');
		} catch (e) {
			Alert.alert('Save failed', e.message);
		}
	};

	return (
		<SafeAreaView style={{ flex: 1 }}>
			<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Button title="T‑Shirt" onPress={() => setItemType('tshirt')} />
					<Button title="Pants" onPress={() => setItemType('pants')} />
				</View>
				<Text>Color (hex)</Text>
				<TextInput value={color} onChangeText={setColor} placeholder="#ffffff" autoCapitalize="none" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
				<Text>Style</Text>
				<TextInput value={style} onChangeText={setStyle} placeholder="classic" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
				<Text>Text</Text>
				<TextInput value={text} onChangeText={setText} placeholder="Your text" style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
				<View style={previewStyle}>
					<Text style={{ fontSize: 24, fontWeight: '700' }}>{itemType === 'tshirt' ? 'T‑Shirt' : 'Pants'}</Text>
					{imageUri ? <Image source={{ uri: imageUri }} style={{ width: 180, height: 180, opacity: 0.9 }} /> : null}
					{Boolean(text) && <Text style={{ fontSize: 20, marginTop: 8 }}>{text}</Text>}
				</View>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Button title="Pick image" onPress={pickImage} />
					<Button title="Upload image" onPress={async () => { try { await uploadImage(); Alert.alert('Uploaded'); } catch (e) { Alert.alert('Upload failed', e.message); } }} />
				</View>
				<Button title="Save design" onPress={saveDesign} />
				<Button title="My designs" onPress={() => navigation.navigate('MyDesigns', { token })} />
				<Button title="Log out" color="tomato" onPress={logout} />
			</ScrollView>
		</SafeAreaView>
	);
}

function MyDesignsScreen({ route }) {
	const { token } = route.params;
	const [designs, setDesigns] = useState([]);

	useEffect(() => {
		(async () => {
			try {
				const data = await apiRequest('/designs', 'GET', null, token);
				setDesigns(data.designs);
			} catch (e) {
				Alert.alert('Error', e.message);
			}
		})();
	}, [token]);

	return (
		<SafeAreaView style={{ flex: 1 }}>
			<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
				{designs.map(d => (
					<View key={d.id} style={{ borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
						<Text style={{ fontWeight: '700' }}>{d.item_type.toUpperCase()} • {d.style || 'classic'}</Text>
						<Text>Color: {d.color}</Text>
						{d.text_overlay ? <Text>Text: {d.text_overlay}</Text> : null}
						{d.image_url ? <Image source={{ uri: `${API_BASE}${d.image_url}` }} style={{ width: '100%', height: 200, borderRadius: 8 }} /> : null}
					</View>
				))}
				{designs.length === 0 && <Text>No designs yet.</Text>}
			</ScrollView>
		</SafeAreaView>
	);
}

const Stack = createNativeStackNavigator();

export default function App() {
	const { token, user, loading, login, signup, logout } = useAuth();
	if (loading) return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></SafeAreaView>;

	return (
		<NavigationContainer>
			<Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
				{!token ? (
					<>
						<Stack.Screen name="Login" component={LoginScreen} initialParams={{ login }} options={{ title: 'Log in' }} />
						<Stack.Screen name="Signup" component={SignupScreen} initialParams={{ signup }} options={{ title: 'Sign up' }} />
					</>
				) : (
					<>
						<Stack.Screen name="Design" component={DesignScreen} initialParams={{ token, logout }} options={{ title: user?.name ? `Hi, ${user.name}` : 'Design' }} />
						<Stack.Screen name="MyDesigns" component={MyDesignsScreen} initialParams={{ token }} options={{ title: 'My Designs' }} />
					</>
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
}